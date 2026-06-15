/// Solver registry. A solver stakes to obtain a `SolverRecord`, which gates
/// participation in settlement and accumulates their fill history for the
/// leaderboard. Staking is in SUI for v1; swapping the stake coin to DEEP is a
/// one-line change to the `SUI` import and `MIN_STAKE`.
module kova::registry;

use sui::balance::Balance;
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use kova::events;

const MIN_STAKE: u64 = 1_000_000_000; // 1 SUI

const E_INSUFFICIENT_STAKE: u64 = 1;
const E_NOT_SOLVER: u64 = 2;

public struct SolverRegistry has key {
    id: UID,
    total_solvers: u64,
    total_stake: u64,
}

public struct SolverRecord has key {
    id: UID,
    solver: address,
    stake: Balance<SUI>,
    fills_completed: u64,
    volume_filled: u64,
    registered_at_ms: u64,
}

fun init(ctx: &mut TxContext) {
    transfer::share_object(SolverRegistry {
        id: object::new(ctx),
        total_solvers: 0,
        total_stake: 0,
    });
}

public fun register(
    registry: &mut SolverRegistry,
    stake: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let amount = stake.value();
    assert!(amount >= MIN_STAKE, E_INSUFFICIENT_STAKE);
    let solver = ctx.sender();

    let record = SolverRecord {
        id: object::new(ctx),
        solver,
        stake: stake.into_balance(),
        fills_completed: 0,
        volume_filled: 0,
        registered_at_ms: clock.timestamp_ms(),
    };

    registry.total_solvers = registry.total_solvers + 1;
    registry.total_stake = registry.total_stake + amount;

    events::solver_registered(solver, amount, object::id(&record));
    transfer::transfer(record, solver);
}

/// Withdraw stake and leave the solver set. Consumes the record.
public fun deregister(
    registry: &mut SolverRegistry,
    record: SolverRecord,
    ctx: &mut TxContext,
): Coin<SUI> {
    assert!(ctx.sender() == record.solver, E_NOT_SOLVER);
    let SolverRecord { id, solver: _, stake, fills_completed: _, volume_filled: _, registered_at_ms: _ } = record;
    registry.total_solvers = registry.total_solvers - 1;
    registry.total_stake = registry.total_stake - stake.value();
    id.delete();
    coin::from_balance(stake, ctx)
}

/// Settlement records a successful fill against the solver's record.
public(package) fun record_fill(record: &mut SolverRecord, volume: u64) {
    record.fills_completed = record.fills_completed + 1;
    record.volume_filled = record.volume_filled + volume;
}

public fun solver(record: &SolverRecord): address { record.solver }

public fun stake_amount(record: &SolverRecord): u64 { record.stake.value() }

public fun fills_completed(record: &SolverRecord): u64 { record.fills_completed }

public fun volume_filled(record: &SolverRecord): u64 { record.volume_filled }

public fun total_solvers(registry: &SolverRegistry): u64 { registry.total_solvers }

public fun total_stake(registry: &SolverRegistry): u64 { registry.total_stake }

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx)
}
