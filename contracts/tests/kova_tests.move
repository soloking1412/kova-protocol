#[test_only]
module kova::kova_tests;

use sui::test_scenario as ts;
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use kova::intent::{Self, KovaIntent};
use kova::registry::{Self, SolverRegistry, SolverRecord};
use kova::settlement::{Self, FeeCollector, FeeCollectorCap};

public struct INPUT has drop {}
public struct OUTPUT has drop {}

const DEPLOYER: address = @0xD;
const SOLVER: address = @0x51;
const SOLVER2: address = @0x52;
const USER: address = @0xA11CE;
const OUTSIDER: address = @0xB0B;

const STAKE: u64 = 2_000_000_000; // 2 SUI
const INPUT_AMT: u64 = 1_000_000;
const GROSS: u64 = 2_000_000;
const MIN_OUT: u64 = 1_500_000;
const DEADLINE: u64 = 120_000;

// Expected surplus split for GROSS=2_000_000, MIN_OUT=1_500_000:
//   surplus      = 500_000
//   protocol_fee = 500_000 * 5 / 10_000          = 250
//   user_bonus   = (500_000 - 250) * 5_000/10_000 = 249_875
//   user_amount  = 1_500_000 + 249_875           = 1_749_875
//   solver_reward= 500_000 - 250 - 249_875       = 249_875
const EXP_FEE: u64 = 250;
const EXP_USER: u64 = 1_749_875;
const EXP_SOLVER: u64 = 249_875;

// --- helpers ---

fun begin_with_protocol(): ts::Scenario {
    let mut sc = ts::begin(DEPLOYER);
    registry::init_for_testing(sc.ctx());
    settlement::init_for_testing(sc.ctx());
    sc
}

fun register(sc: &mut ts::Scenario, who: address, clock: &Clock) {
    sc.next_tx(who);
    let mut reg = ts::take_shared<SolverRegistry>(sc);
    let stake = coin::mint_for_testing<SUI>(STAKE, sc.ctx());
    registry::register(&mut reg, stake, clock, sc.ctx());
    ts::return_shared(reg);
}

fun create_intent_for(sc: &mut ts::Scenario, who: address, min_out: u64, deadline: u64, clock: &Clock) {
    sc.next_tx(who);
    let input = coin::mint_for_testing<INPUT>(INPUT_AMT, sc.ctx());
    let intent = intent::create_intent<INPUT>(
        input,
        b"0x2::test::OUTPUT",
        min_out,
        1,
        true,
        deadline,
        clock,
        sc.ctx(),
    );
    intent::share_intent(intent);
}

/// Solver takes the input, simulates routing into `gross` OUTPUT, and settles.
fun fill(sc: &mut ts::Scenario, solver: address, gross: u64, clock: &Clock) {
    sc.next_tx(solver);
    let mut intent = ts::take_shared<KovaIntent<INPUT>>(sc);
    let mut record = ts::take_from_sender<SolverRecord>(sc);
    let mut collector = ts::take_shared<FeeCollector>(sc);

    let (input, receipt) = settlement::take_input<INPUT>(&mut intent, &record, clock, sc.ctx());
    coin::burn_for_testing(input);
    let output = coin::mint_for_testing<OUTPUT>(gross, sc.ctx());
    settlement::settle<INPUT, OUTPUT>(&mut intent, &mut record, &mut collector, receipt, output, clock, sc.ctx());

    ts::return_shared(intent);
    ts::return_to_sender(sc, record);
    ts::return_shared(collector);
}

// --- settlement economics ---

#[test]
fun fill_splits_surplus_floor_user_solver_protocol() {
    let mut sc = begin_with_protocol();
    sc.next_tx(DEPLOYER);
    let clock = clock::create_for_testing(sc.ctx());

    register(&mut sc, SOLVER, &clock);
    create_intent_for(&mut sc, USER, MIN_OUT, DEADLINE, &clock);

    sc.next_tx(SOLVER);
    {
        let mut intent = ts::take_shared<KovaIntent<INPUT>>(&sc);
        let mut record = ts::take_from_sender<SolverRecord>(&sc);
        let mut collector = ts::take_shared<FeeCollector>(&sc);

        let (input, receipt) = settlement::take_input<INPUT>(&mut intent, &record, &clock, sc.ctx());
        coin::burn_for_testing(input);
        let output = coin::mint_for_testing<OUTPUT>(GROSS, sc.ctx());
        settlement::settle<INPUT, OUTPUT>(&mut intent, &mut record, &mut collector, receipt, output, &clock, sc.ctx());

        assert!(intent::status(&intent) == intent::status_filled(), 0);
        assert!(registry::fills_completed(&record) == 1, 1);
        assert!(registry::volume_filled(&record) == GROSS, 2);

        ts::return_shared(intent);
        ts::return_to_sender(&sc, record);
        ts::return_shared(collector);
    };

    // User receives floor + price-improvement share.
    sc.next_tx(USER);
    {
        let payout = ts::take_from_sender<Coin<OUTPUT>>(&sc);
        assert!(coin::value(&payout) == EXP_USER, 3);
        coin::burn_for_testing(payout);
    };

    // Solver keeps its reward.
    sc.next_tx(SOLVER);
    {
        let reward = ts::take_from_sender<Coin<OUTPUT>>(&sc);
        assert!(coin::value(&reward) == EXP_SOLVER, 4);
        coin::burn_for_testing(reward);
    };

    // Protocol fee on the surplus.
    sc.next_tx(DEPLOYER);
    {
        let mut collector = ts::take_shared<FeeCollector>(&sc);
        let cap = ts::take_from_sender<FeeCollectorCap>(&sc);
        let fees = settlement::withdraw_fees<OUTPUT>(&mut collector, &cap, sc.ctx());
        assert!(coin::value(&fees) == EXP_FEE, 5);
        coin::burn_for_testing(fees);
        ts::return_shared(collector);
        ts::return_to_sender(&sc, cap);
    };

    clock::destroy_for_testing(clock);
    sc.end();
}

#[test]
fun fill_at_exact_floor_pays_only_user() {
    let mut sc = begin_with_protocol();
    sc.next_tx(DEPLOYER);
    let clock = clock::create_for_testing(sc.ctx());

    register(&mut sc, SOLVER, &clock);
    create_intent_for(&mut sc, USER, MIN_OUT, DEADLINE, &clock);

    // gross == floor: no surplus, no fee, no solver reward.
    fill(&mut sc, SOLVER, MIN_OUT, &clock);

    sc.next_tx(USER);
    {
        let payout = ts::take_from_sender<Coin<OUTPUT>>(&sc);
        assert!(coin::value(&payout) == MIN_OUT, 0);
        coin::burn_for_testing(payout);
    };

    clock::destroy_for_testing(clock);
    sc.end();
}

#[test]
#[expected_failure(abort_code = 4, location = kova::settlement)]
fun reverts_when_output_below_floor() {
    let mut sc = begin_with_protocol();
    sc.next_tx(DEPLOYER);
    let clock = clock::create_for_testing(sc.ctx());

    register(&mut sc, SOLVER, &clock);
    create_intent_for(&mut sc, USER, 5_000_000, DEADLINE, &clock); // unreachable floor
    fill(&mut sc, SOLVER, GROSS, &clock); // gross < floor -> abort

    clock::destroy_for_testing(clock);
    sc.end();
}

#[test]
#[expected_failure(abort_code = 1, location = kova::settlement)]
fun settle_with_wrong_intent_aborts() {
    let mut sc = begin_with_protocol();
    sc.next_tx(DEPLOYER);
    let clock = clock::create_for_testing(sc.ctx());

    register(&mut sc, SOLVER, &clock);
    create_intent_for(&mut sc, USER, MIN_OUT, DEADLINE, &clock);

    sc.next_tx(SOLVER);
    {
        let mut intentA = ts::take_shared<KovaIntent<INPUT>>(&sc);
        let mut record = ts::take_from_sender<SolverRecord>(&sc);
        let mut collector = ts::take_shared<FeeCollector>(&sc);

        let (input, receipt) = settlement::take_input<INPUT>(&mut intentA, &record, &clock, sc.ctx());
        coin::burn_for_testing(input);

        // A fresh, unrelated intent — settling against it must abort.
        let other_input = coin::mint_for_testing<INPUT>(INPUT_AMT, sc.ctx());
        let mut other = intent::create_intent<INPUT>(other_input, b"0x2::test::OUTPUT", MIN_OUT, 1, true, DEADLINE, &clock, sc.ctx());

        let output = coin::mint_for_testing<OUTPUT>(GROSS, sc.ctx());
        settlement::settle<INPUT, OUTPUT>(&mut other, &mut record, &mut collector, receipt, output, &clock, sc.ctx());

        intent::share_intent(other);
        ts::return_shared(intentA);
        ts::return_to_sender(&sc, record);
        ts::return_shared(collector);
    };

    clock::destroy_for_testing(clock);
    sc.end();
}

#[test]
#[expected_failure(abort_code = 2, location = kova::settlement)]
fun wrong_solver_cannot_take_input() {
    let mut sc = begin_with_protocol();
    sc.next_tx(DEPLOYER);
    let clock = clock::create_for_testing(sc.ctx());

    register(&mut sc, SOLVER, &clock);
    create_intent_for(&mut sc, USER, MIN_OUT, DEADLINE, &clock);

    // OUTSIDER tries to fill using SOLVER's record.
    sc.next_tx(OUTSIDER);
    {
        let mut intent = ts::take_shared<KovaIntent<INPUT>>(&sc);
        let mut record = ts::take_from_address<SolverRecord>(&sc, SOLVER);
        let mut collector = ts::take_shared<FeeCollector>(&sc);

        let (input, receipt) = settlement::take_input<INPUT>(&mut intent, &record, &clock, sc.ctx());
        coin::burn_for_testing(input);
        let output = coin::mint_for_testing<OUTPUT>(GROSS, sc.ctx());
        settlement::settle<INPUT, OUTPUT>(&mut intent, &mut record, &mut collector, receipt, output, &clock, sc.ctx());

        ts::return_shared(intent);
        ts::return_to_address(SOLVER, record);
        ts::return_shared(collector);
    };

    clock::destroy_for_testing(clock);
    sc.end();
}

#[test]
#[expected_failure(abort_code = 1, location = kova::intent)]
fun second_solver_cannot_refill() {
    let mut sc = begin_with_protocol();
    sc.next_tx(DEPLOYER);
    let clock = clock::create_for_testing(sc.ctx());

    register(&mut sc, SOLVER, &clock);
    create_intent_for(&mut sc, USER, MIN_OUT, DEADLINE, &clock);
    fill(&mut sc, SOLVER, GROSS, &clock);
    fill(&mut sc, SOLVER, GROSS, &clock); // intent is FILLED -> claim_input aborts

    clock::destroy_for_testing(clock);
    sc.end();
}

#[test]
#[expected_failure(abort_code = 4, location = kova::intent)]
fun take_input_after_deadline_aborts() {
    let mut sc = begin_with_protocol();
    sc.next_tx(DEPLOYER);
    let mut clock = clock::create_for_testing(sc.ctx());

    register(&mut sc, SOLVER, &clock);
    create_intent_for(&mut sc, USER, MIN_OUT, 30_000, &clock);

    clock::increment_for_testing(&mut clock, 31_000);
    fill(&mut sc, SOLVER, GROSS, &clock); // past deadline -> claim_input aborts

    clock::destroy_for_testing(clock);
    sc.end();
}

// --- intent lifecycle ---

#[test]
#[expected_failure(abort_code = 3, location = kova::intent)]
fun deadline_too_short_aborts() {
    let mut sc = ts::begin(USER);
    let clock = clock::create_for_testing(sc.ctx());
    let input = coin::mint_for_testing<INPUT>(INPUT_AMT, sc.ctx());
    let intent = intent::create_intent<INPUT>(input, b"0x2::test::OUTPUT", MIN_OUT, 1, true, 10_000, &clock, sc.ctx());
    intent::share_intent(intent);
    clock::destroy_for_testing(clock);
    sc.end();
}

#[test]
#[expected_failure(abort_code = 3, location = kova::intent)]
fun deadline_too_long_aborts() {
    let mut sc = ts::begin(USER);
    let clock = clock::create_for_testing(sc.ctx());
    let input = coin::mint_for_testing<INPUT>(INPUT_AMT, sc.ctx());
    let intent = intent::create_intent<INPUT>(input, b"0x2::test::OUTPUT", MIN_OUT, 1, true, 700_000, &clock, sc.ctx());
    intent::share_intent(intent);
    clock::destroy_for_testing(clock);
    sc.end();
}

#[test]
fun cancel_refunds_owner() {
    let mut sc = ts::begin(USER);
    let clock = clock::create_for_testing(sc.ctx());
    create_intent_for(&mut sc, USER, MIN_OUT, DEADLINE, &clock);

    sc.next_tx(USER);
    {
        let mut intent = ts::take_shared<KovaIntent<INPUT>>(&sc);
        intent::cancel_intent(&mut intent, sc.ctx());
        assert!(intent::status(&intent) == intent::status_cancelled(), 0);
        ts::return_shared(intent);
    };

    sc.next_tx(USER);
    {
        let refund = ts::take_from_sender<Coin<INPUT>>(&sc);
        assert!(coin::value(&refund) == INPUT_AMT, 1);
        coin::burn_for_testing(refund);
    };

    clock::destroy_for_testing(clock);
    sc.end();
}

#[test]
#[expected_failure(abort_code = 2, location = kova::intent)]
fun cancel_by_non_owner_aborts() {
    let mut sc = ts::begin(USER);
    let clock = clock::create_for_testing(sc.ctx());
    create_intent_for(&mut sc, USER, MIN_OUT, DEADLINE, &clock);

    sc.next_tx(OUTSIDER);
    {
        let mut intent = ts::take_shared<KovaIntent<INPUT>>(&sc);
        intent::cancel_intent(&mut intent, sc.ctx()); // not the owner -> abort
        ts::return_shared(intent);
    };

    clock::destroy_for_testing(clock);
    sc.end();
}

#[test]
#[expected_failure(abort_code = 1, location = kova::intent)]
fun cancel_filled_intent_aborts() {
    let mut sc = begin_with_protocol();
    sc.next_tx(DEPLOYER);
    let clock = clock::create_for_testing(sc.ctx());

    register(&mut sc, SOLVER, &clock);
    create_intent_for(&mut sc, USER, MIN_OUT, DEADLINE, &clock);
    fill(&mut sc, SOLVER, GROSS, &clock);

    sc.next_tx(USER);
    {
        let mut intent = ts::take_shared<KovaIntent<INPUT>>(&sc);
        intent::cancel_intent(&mut intent, sc.ctx()); // already FILLED -> abort
        ts::return_shared(intent);
    };

    clock::destroy_for_testing(clock);
    sc.end();
}

#[test]
fun expire_refunds_owner() {
    let mut sc = ts::begin(USER);
    let mut clock = clock::create_for_testing(sc.ctx());
    create_intent_for(&mut sc, USER, MIN_OUT, 30_000, &clock);

    clock::increment_for_testing(&mut clock, 31_000);

    sc.next_tx(OUTSIDER); // anyone may expire
    {
        let mut intent = ts::take_shared<KovaIntent<INPUT>>(&sc);
        intent::expire_intent(&mut intent, &clock, sc.ctx());
        assert!(intent::status(&intent) == intent::status_expired(), 0);
        ts::return_shared(intent);
    };

    sc.next_tx(USER);
    {
        let refund = ts::take_from_sender<Coin<INPUT>>(&sc);
        assert!(coin::value(&refund) == INPUT_AMT, 1);
        coin::burn_for_testing(refund);
    };

    clock::destroy_for_testing(clock);
    sc.end();
}

#[test]
#[expected_failure(abort_code = 5, location = kova::intent)]
fun expire_before_deadline_aborts() {
    let mut sc = ts::begin(USER);
    let clock = clock::create_for_testing(sc.ctx());
    create_intent_for(&mut sc, USER, MIN_OUT, DEADLINE, &clock);

    sc.next_tx(OUTSIDER);
    {
        let mut intent = ts::take_shared<KovaIntent<INPUT>>(&sc);
        intent::expire_intent(&mut intent, &clock, sc.ctx()); // still within deadline -> abort
        ts::return_shared(intent);
    };

    clock::destroy_for_testing(clock);
    sc.end();
}

// --- registry ---

#[test]
#[expected_failure(abort_code = 1, location = kova::registry)]
fun register_below_min_stake_aborts() {
    let mut sc = begin_with_protocol();
    sc.next_tx(DEPLOYER);
    let clock = clock::create_for_testing(sc.ctx());

    sc.next_tx(SOLVER);
    {
        let mut reg = ts::take_shared<SolverRegistry>(&sc);
        let stake = coin::mint_for_testing<SUI>(500_000_000, sc.ctx()); // 0.5 SUI
        registry::register(&mut reg, stake, &clock, sc.ctx());
        ts::return_shared(reg);
    };

    clock::destroy_for_testing(clock);
    sc.end();
}

#[test]
fun registry_tracks_totals() {
    let mut sc = begin_with_protocol();
    sc.next_tx(DEPLOYER);
    let clock = clock::create_for_testing(sc.ctx());

    register(&mut sc, SOLVER, &clock);
    register(&mut sc, SOLVER2, &clock);

    sc.next_tx(DEPLOYER);
    {
        let reg = ts::take_shared<SolverRegistry>(&sc);
        assert!(registry::total_solvers(&reg) == 2, 0);
        assert!(registry::total_stake(&reg) == STAKE * 2, 1);
        ts::return_shared(reg);
    };

    clock::destroy_for_testing(clock);
    sc.end();
}

#[test]
fun deregister_returns_stake() {
    let mut sc = begin_with_protocol();
    sc.next_tx(DEPLOYER);
    let clock = clock::create_for_testing(sc.ctx());

    register(&mut sc, SOLVER, &clock);

    sc.next_tx(SOLVER);
    {
        let mut reg = ts::take_shared<SolverRegistry>(&sc);
        let record = ts::take_from_sender<SolverRecord>(&sc);
        let stake = registry::deregister(&mut reg, record, sc.ctx());
        assert!(coin::value(&stake) == STAKE, 0);
        assert!(registry::total_solvers(&reg) == 0, 1);
        assert!(registry::total_stake(&reg) == 0, 2);
        coin::burn_for_testing(stake);
        ts::return_shared(reg);
    };

    clock::destroy_for_testing(clock);
    sc.end();
}

#[test]
#[expected_failure(abort_code = 2, location = kova::registry)]
fun deregister_by_non_solver_aborts() {
    let mut sc = begin_with_protocol();
    sc.next_tx(DEPLOYER);
    let clock = clock::create_for_testing(sc.ctx());

    register(&mut sc, SOLVER, &clock);

    sc.next_tx(OUTSIDER);
    {
        let mut reg = ts::take_shared<SolverRegistry>(&sc);
        let record = ts::take_from_address<SolverRecord>(&sc, SOLVER);
        let stake = registry::deregister(&mut reg, record, sc.ctx()); // not the solver -> abort
        coin::burn_for_testing(stake);
        ts::return_shared(reg);
    };

    clock::destroy_for_testing(clock);
    sc.end();
}
