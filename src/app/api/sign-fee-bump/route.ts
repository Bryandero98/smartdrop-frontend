import { NextResponse } from 'next/server';
import { Keypair, TransactionBuilder, Transaction } from '@stellar/stellar-sdk';
import { buildFeeBumpTransaction, sorobanService } from '@/lib/soroban';
import { networkPassphrase } from '@/config';
import { assertSponsorableInnerTransaction, feeBumpRateLimiter } from '@/lib/feeBumpGuard';

export async function POST(request: Request) {
  try {
    const sponsorSecret = process.env.STELLAR_FEE_SPONSOR_SECRET;
    if (!sponsorSecret) {
      console.error('[SignFeeBump] Sponsor secret (STELLAR_FEE_SPONSOR_SECRET) is not configured.');
      return NextResponse.json(
        { error: 'Sponsor secret key is not configured on the server' },
        { status: 500 },
      );
    }

    let body: { innerTxXdr?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const { innerTxXdr } = body;
    if (!innerTxXdr) {
      return NextResponse.json({ error: 'Missing innerTxXdr in request body' }, { status: 400 });
    }

    // Rate-limit by caller IP before doing any parsing/RPC work (issue #124).
    const callerIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!feeBumpRateLimiter.tryConsume(callerIp)) {
      return NextResponse.json(
        { error: 'Too many fee-bump requests. Please slow down.' },
        { status: 429 },
      );
    }

    // Load sponsor keypair
    let sponsorKeypair: Keypair;
    try {
      sponsorKeypair = Keypair.fromSecret(sponsorSecret);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[SignFeeBump] Invalid sponsor secret key format:', msg);
      return NextResponse.json(
        { error: 'Invalid sponsor secret key configuration' },
        { status: 500 },
      );
    }

    // Parse the inner transaction
    let innerTxObj: Transaction;
    try {
      innerTxObj = TransactionBuilder.fromXDR(
        innerTxXdr,
        networkPassphrase,
      ) as Transaction;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Invalid inner transaction XDR: ${msg}` },
        { status: 400 },
      );
    }

    // Only fee-bump a signed lock_assets/unlock_assets call against a known
    // pool contract — never an arbitrary caller-supplied transaction (#124).
    try {
      const pools = await sorobanService.getFactoryPools();
      const knownPoolContractIds = new Set(pools.map((pool) => pool.contractAddress));
      assertSponsorableInnerTransaction(innerTxObj, knownPoolContractIds);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[SignFeeBump] Rejected non-sponsorable inner transaction:', msg);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Build the fee-bump transaction
    const feeBumpTx = buildFeeBumpTransaction(
      innerTxObj,
      sponsorKeypair.publicKey(),
      networkPassphrase,
    );

    // Sign the outer fee-bump envelope
    feeBumpTx.sign(sponsorKeypair);

    // Return the completed fee-bump transaction XDR
    return NextResponse.json({
      feeBumpTxXdr: feeBumpTx.toEnvelope().toXDR('base64'),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    console.error('[SignFeeBump] Server error:', error);
    return NextResponse.json(
      { error: msg },
      { status: 500 },
    );
  }
}
