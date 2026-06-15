/// Routing hints. KOVA stays venue-agnostic at the contract level — actual
/// routing happens in the solver's PTB — so this module only encodes the
/// protocol bitmask a user can express as a preference.
module kova::router;

const DEEPBOOK: u8 = 1;
const CETUS: u8 = 2;
const SCALLOP: u8 = 4;

public fun deepbook(): u8 { DEEPBOOK }

public fun cetus(): u8 { CETUS }

public fun scallop(): u8 { SCALLOP }

public fun any_protocol(): u8 { DEEPBOOK | CETUS | SCALLOP }

public fun protocol_allowed(mask: u8, protocol: u8): bool {
    mask & protocol == protocol
}
