/**
 * How long to wait before resending a request whose token PostgREST rejected
 * as "JWT issued at future".
 *
 * The 28 Sep failure: a token with `iat` 21:23:12 was refused at 21:23:12.599,
 * so the validator's clock was at least 0.6 s behind the issuer's. The same
 * token was accepted 13 ms earlier and 0.5 s later by other requests, so the
 * skew belongs to one node, not the token. Two seconds clears what was seen
 * with room to spare, and it is only ever paid on the request that failed.
 */
export const ISSUED_AT_FUTURE_RETRY_MS = 2000;
