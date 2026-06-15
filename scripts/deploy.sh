#!/usr/bin/env bash
# Publish the KOVA contracts and print the IDs needed by the solver and frontend.
# The registry and fee collector are created by module `init` on publish, so
# publishing is the only on-chain step.
set -euo pipefail

CONTRACTS_DIR="$(cd "$(dirname "$0")/../contracts" && pwd)"
GAS_BUDGET="${GAS_BUDGET:-200000000}"

cd "$CONTRACTS_DIR"

echo "Building..."
sui move build

echo "Publishing to $(sui client active-env)..."
OUT=$(sui client publish --gas-budget "$GAS_BUDGET" --json)

PKG=$(echo "$OUT" | jq -r '.objectChanges[] | select(.type=="published") | .packageId')
REGISTRY=$(echo "$OUT" | jq -r '.objectChanges[] | select(.type=="created" and (.objectType|test("::registry::SolverRegistry$"))) | .objectId')
COLLECTOR=$(echo "$OUT" | jq -r '.objectChanges[] | select(.type=="created" and (.objectType|test("::settlement::FeeCollector$"))) | .objectId')
CAP=$(echo "$OUT" | jq -r '.objectChanges[] | select(.type=="created" and (.objectType|test("::settlement::FeeCollectorCap$"))) | .objectId')

echo ""
echo "Deployed."
echo "  package       : $PKG"
echo "  registry      : $REGISTRY"
echo "  fee collector : $COLLECTOR"
echo "  collector cap : $CAP"
echo ""
echo "solver/.env:"
echo "  KOVA_PACKAGE_ID=$PKG"
echo "  FEE_COLLECTOR_ID=$COLLECTOR"
echo "  REGISTRY_ID=$REGISTRY"
echo ""
echo "frontend/.env.local:"
echo "  NEXT_PUBLIC_KOVA_PACKAGE_ID=$PKG"
echo ""
echo "Next: register the solver with scripts/fund-solver.ts to get SOLVER_RECORD_ID."
