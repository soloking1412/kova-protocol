/// KovaIntent — a user's declared swap intent, held on-chain as a shared
/// object so the whole solver network can observe and compete for it.
///
/// The user's input coin is escrowed inside the intent at creation. A solver
/// can only extract it through `claim_input` (driven by settlement.move), which
/// hands the coin out together with a hot-potato receipt that forces settlement
/// in the same transaction. If the promised output is not delivered, the whole
/// PTB reverts and the escrow is untouched.
module kova::intent;

use std::type_name;
use sui::balance::Balance;
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use kova::events;

const STATUS_OPEN: u8 = 0;
const STATUS_FILLED: u8 = 1;
const STATUS_EXPIRED: u8 = 2;
const STATUS_CANCELLED: u8 = 3;
const STATUS_CLAIMED: u8 = 4;

const MIN_DEADLINE_MS: u64 = 30_000; // 30 seconds
const MAX_DEADLINE_MS: u64 = 600_000; // 10 minutes

const E_WRONG_STATUS: u64 = 1;
const E_NOT_OWNER: u64 = 2;
const E_DEADLINE_OUT_OF_RANGE: u64 = 3;
const E_EXPIRED: u64 = 4;
const E_NOT_EXPIRED: u64 = 5;

public struct KovaIntent<phantom Input> has key {
    id: UID,
    owner: address,
    input_type: vector<u8>,
    input_amount: u64,
    output_type: vector<u8>,
    min_output_amount: u64,
    preferred_protocols: u8,
    allow_split_routing: bool,
    created_at_ms: u64,
    deadline_ms: u64,
    status: u8,
    solver: Option<address>,
    actual_output: Option<u64>,
    escrow: Balance<Input>,
}

/// Build an intent, escrowing `input`. Returned by value so the caller can
/// `share_intent` it in the same PTB. The input type is derived on-chain from
/// the coin, so it can never disagree with what is actually escrowed.
public fun create_intent<Input>(
    input: Coin<Input>,
    output_type: vector<u8>,
    min_output_amount: u64,
    preferred_protocols: u8,
    allow_split_routing: bool,
    deadline_offset_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): KovaIntent<Input> {
    assert!(
        deadline_offset_ms >= MIN_DEADLINE_MS && deadline_offset_ms <= MAX_DEADLINE_MS,
        E_DEADLINE_OUT_OF_RANGE,
    );
    let now = clock.timestamp_ms();
    let owner = ctx.sender();
    let input_amount = input.value();
    let input_type = type_name::with_defining_ids<Input>().into_string().into_bytes();

    let intent = KovaIntent<Input> {
        id: object::new(ctx),
        owner,
        input_type,
        input_amount,
        output_type,
        min_output_amount,
        preferred_protocols,
        allow_split_routing,
        created_at_ms: now,
        deadline_ms: now + deadline_offset_ms,
        status: STATUS_OPEN,
        solver: option::none(),
        actual_output: option::none(),
        escrow: input.into_balance(),
    };

    events::intent_created(
        object::id(&intent),
        owner,
        intent.input_type,
        input_amount,
        intent.output_type,
        min_output_amount,
        intent.deadline_ms,
    );

    intent
}

public fun share_intent<Input>(intent: KovaIntent<Input>) {
    transfer::share_object(intent);
}

/// Extract the escrowed input for the winning solver and mark the intent
/// claimed. Settlement-only entry point; the returned coin must be settled in
/// the same transaction (enforced by the hot potato in settlement.move).
public(package) fun claim_input<Input>(
    intent: &mut KovaIntent<Input>,
    solver: address,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<Input> {
    assert!(intent.status == STATUS_OPEN, E_WRONG_STATUS);
    assert!(clock.timestamp_ms() <= intent.deadline_ms, E_EXPIRED);
    intent.status = STATUS_CLAIMED;
    intent.solver = option::some(solver);
    coin::from_balance(intent.escrow.withdraw_all(), ctx)
}

/// Finalize a claimed intent. Slippage is enforced by the caller (settlement),
/// which only reaches this point once the user's minimum is met.
public(package) fun mark_filled<Input>(
    intent: &mut KovaIntent<Input>,
    solver: address,
    actual_output: u64,
    clock: &Clock,
) {
    assert!(intent.status == STATUS_CLAIMED, E_WRONG_STATUS);
    assert!(clock.timestamp_ms() <= intent.deadline_ms, E_EXPIRED);
    intent.status = STATUS_FILLED;
    intent.actual_output = option::some(actual_output);
    events::intent_filled(object::id(intent), solver, actual_output);
}

/// Owner reclaims their escrow before the intent is filled.
public fun cancel_intent<Input>(intent: &mut KovaIntent<Input>, ctx: &mut TxContext) {
    assert!(intent.status == STATUS_OPEN, E_WRONG_STATUS);
    assert!(ctx.sender() == intent.owner, E_NOT_OWNER);
    intent.status = STATUS_CANCELLED;
    let refund = coin::from_balance(intent.escrow.withdraw_all(), ctx);
    transfer::public_transfer(refund, intent.owner);
    events::intent_closed(object::id(intent), STATUS_CANCELLED);
}

/// Anyone may expire a past-deadline intent; the escrow goes back to the owner.
public fun expire_intent<Input>(intent: &mut KovaIntent<Input>, clock: &Clock, ctx: &mut TxContext) {
    assert!(intent.status == STATUS_OPEN, E_WRONG_STATUS);
    assert!(clock.timestamp_ms() > intent.deadline_ms, E_NOT_EXPIRED);
    intent.status = STATUS_EXPIRED;
    let refund = coin::from_balance(intent.escrow.withdraw_all(), ctx);
    transfer::public_transfer(refund, intent.owner);
    events::intent_closed(object::id(intent), STATUS_EXPIRED);
}

public fun owner<Input>(intent: &KovaIntent<Input>): address { intent.owner }

public fun status<Input>(intent: &KovaIntent<Input>): u8 { intent.status }

public fun input_amount<Input>(intent: &KovaIntent<Input>): u64 { intent.input_amount }

public fun min_output<Input>(intent: &KovaIntent<Input>): u64 { intent.min_output_amount }

public fun deadline<Input>(intent: &KovaIntent<Input>): u64 { intent.deadline_ms }

public fun escrow_value<Input>(intent: &KovaIntent<Input>): u64 { intent.escrow.value() }

public fun is_open<Input>(intent: &KovaIntent<Input>): bool { intent.status == STATUS_OPEN }

public fun status_filled(): u8 { STATUS_FILLED }

public fun status_cancelled(): u8 { STATUS_CANCELLED }

public fun status_expired(): u8 { STATUS_EXPIRED }
