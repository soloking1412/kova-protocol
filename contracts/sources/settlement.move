/// Settlement engine. The solver's PTB runs three steps atomically:
///
///   1. `take_input`  — pull the escrowed input and a hot-potato `FillReceipt`.
///   2. route the input through any venue (DeepBook) producing `Coin<Output>`.
///   3. `settle`      — verify output >= the user's floor, pay the user their
///                      floor plus a surplus share, take the protocol fee, pay
///                      the solver its reward, and consume the receipt.
///
/// `FillReceipt` has no abilities, so the only way to discharge it is `settle`.
/// A solver therefore cannot take the input and walk away, and if the output is
/// short the assertion in `settle` reverts the entire PTB — leaving the escrow
/// exactly where it was. That is the protocol's zero-settlement-risk guarantee.
module kova::settlement;

use std::type_name;
use sui::balance::Balance;
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::dynamic_field as df;
use kova::intent::{Self, KovaIntent};
use kova::registry::{Self, SolverRecord};

// Economics. The user is always guaranteed their floor (`min_output`). Any
// surplus the solver's route captures above the floor is split: the protocol
// takes a fee on it, the user gets a share as price improvement, and the solver
// keeps the rest as its reward — the incentive to compete for the fill.
const PROTOCOL_FEE_BPS: u64 = 5; // 0.05% of surplus
const USER_SURPLUS_BPS: u64 = 5_000; // 50% of net surplus returned to the user
const BPS_DENOMINATOR: u64 = 10_000;

const E_WRONG_INTENT: u64 = 1;
const E_WRONG_SOLVER: u64 = 2;
const E_OUTPUT_TOO_LOW: u64 = 4;
const E_WRONG_CAP: u64 = 5;

/// Multi-asset fee treasury. Per-coin balances are held as dynamic fields keyed
/// by the coin's type name, so one shared object collects fees in any currency.
public struct FeeCollector has key {
    id: UID,
}

public struct FeeCollectorCap has key, store {
    id: UID,
    collector: ID,
}

/// Hot potato binding the input withdrawal to its settlement in the same PTB.
public struct FillReceipt {
    intent_id: ID,
    owner: address,
    min_output: u64,
    solver: address,
}

fun init(ctx: &mut TxContext) {
    let collector = FeeCollector { id: object::new(ctx) };
    let cap = FeeCollectorCap { id: object::new(ctx), collector: object::id(&collector) };
    transfer::share_object(collector);
    transfer::transfer(cap, ctx.sender());
}

public fun take_input<Input>(
    intent: &mut KovaIntent<Input>,
    record: &SolverRecord,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<Input>, FillReceipt) {
    let solver = ctx.sender();
    assert!(registry::solver(record) == solver, E_WRONG_SOLVER);

    let receipt = FillReceipt {
        intent_id: object::id(intent),
        owner: intent::owner(intent),
        min_output: intent::min_output(intent),
        solver,
    };
    let input = intent::claim_input(intent, solver, clock, ctx);
    (input, receipt)
}

public fun settle<Input, Output>(
    intent: &mut KovaIntent<Input>,
    record: &mut SolverRecord,
    collector: &mut FeeCollector,
    receipt: FillReceipt,
    mut output: Coin<Output>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let FillReceipt { intent_id, owner, min_output, solver } = receipt;
    assert!(intent_id == object::id(intent), E_WRONG_INTENT);

    let gross = output.value();
    assert!(gross >= min_output, E_OUTPUT_TOO_LOW);

    // Split the surplus above the floor: protocol fee, user price improvement,
    // solver reward.
    let surplus = gross - min_output;
    let protocol_fee = (surplus * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
    let user_bonus = ((surplus - protocol_fee) * USER_SURPLUS_BPS) / BPS_DENOMINATOR;
    let user_amount = min_output + user_bonus;

    // User receives their guaranteed floor plus their share of the surplus.
    let user_coin = output.split(user_amount, ctx);
    transfer::public_transfer(user_coin, owner);

    // Protocol fee, taken only on captured surplus.
    if (protocol_fee > 0) {
        let fee = output.split(protocol_fee, ctx);
        deposit_fee(collector, fee);
    };

    // Remainder is the solver's reward (may be zero at an exact-floor fill).
    if (output.value() > 0) {
        transfer::public_transfer(output, solver);
    } else {
        output.destroy_zero();
    };

    intent::mark_filled(intent, solver, user_amount, clock);
    registry::record_fill(record, gross);
}

public fun user_surplus_bps(): u64 { USER_SURPLUS_BPS }

/// Withdraw all collected fees of one coin type. Cap-gated to the deployer.
public fun withdraw_fees<Output>(
    collector: &mut FeeCollector,
    cap: &FeeCollectorCap,
    ctx: &mut TxContext,
): Coin<Output> {
    assert!(cap.collector == object::id(collector), E_WRONG_CAP);
    let key = type_name::with_defining_ids<Output>();
    let bal: Balance<Output> = df::remove(&mut collector.id, key);
    coin::from_balance(bal, ctx)
}

fun deposit_fee<Output>(collector: &mut FeeCollector, fee: Coin<Output>) {
    let key = type_name::with_defining_ids<Output>();
    if (df::exists_(&collector.id, key)) {
        let bal: &mut Balance<Output> = df::borrow_mut(&mut collector.id, key);
        bal.join(fee.into_balance());
    } else {
        df::add(&mut collector.id, key, fee.into_balance());
    }
}

public fun protocol_fee_bps(): u64 { PROTOCOL_FEE_BPS }

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx)
}
