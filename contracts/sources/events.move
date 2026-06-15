/// Protocol event schema. Centralizing the structs here keeps the on-chain
/// log shape in one place for indexers and the solver's gRPC watcher.
module kova::events;

use sui::event;

public struct IntentCreated has copy, drop {
    intent_id: ID,
    owner: address,
    input_type: vector<u8>,
    input_amount: u64,
    output_type: vector<u8>,
    min_output_amount: u64,
    deadline_ms: u64,
}

public struct IntentFilled has copy, drop {
    intent_id: ID,
    solver: address,
    actual_output: u64,
}

public struct IntentClosed has copy, drop {
    intent_id: ID,
    reason: u8,
}

public struct SolverRegistered has copy, drop {
    solver: address,
    stake_amount: u64,
    record_id: ID,
}

public(package) fun intent_created(
    intent_id: ID,
    owner: address,
    input_type: vector<u8>,
    input_amount: u64,
    output_type: vector<u8>,
    min_output_amount: u64,
    deadline_ms: u64,
) {
    event::emit(IntentCreated {
        intent_id,
        owner,
        input_type,
        input_amount,
        output_type,
        min_output_amount,
        deadline_ms,
    });
}

public(package) fun intent_filled(intent_id: ID, solver: address, actual_output: u64) {
    event::emit(IntentFilled { intent_id, solver, actual_output });
}

public(package) fun intent_closed(intent_id: ID, reason: u8) {
    event::emit(IntentClosed { intent_id, reason });
}

public(package) fun solver_registered(solver: address, stake_amount: u64, record_id: ID) {
    event::emit(SolverRegistered { solver, stake_amount, record_id });
}
