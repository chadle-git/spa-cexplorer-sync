#!/usr/bin/env node
/**
 * Fetches the SinglePoolAlliance registry.json and generates
 * a cexplorer-community group file (mainnet/groups/singlepoolalliance.json)
 *
 * Pool IDs in registry.json are hex (28 bytes).
 * cexplorer expects bech32 format: pool1...
 */

const REGISTRY_URL =
  'https://raw.githubusercontent.com/SinglePoolAlliances/Registration/master/registry.json';

// ── Minimal bech32 encoder (no dependencies needed) ──────────────────────────

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values) {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= GENERATOR[i];
    }
  }
  return chk;
}

function hrpExpand(hrp) {
  const res = [];
  for (const c of hrp) res.push(c.charCodeAt(0) >>> 5);
  res.push(0);
  for (const c of hrp) res.push(c.charCodeAt(0) & 31);
  return res;
}

function createChecksum(hrp, data) {
  const enc = [...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const mod = polymod(enc) ^ 1;
  return Array.from({ length: 6 }, (_, i) => (mod >>> (5 * (5 - i))) & 31);
}

function convertBits(bytes, from, to) {
  let acc = 0, bits = 0;
  const result = [];
  const maxv = (1 << to) - 1;
  for (const b of bytes) {
    acc = (acc << from) | b;
    bits += from;
    while (bits >= to) {
      bits -= to;
      result.push((acc >>> bits) & maxv);
    }
  }
  if (bits > 0) result.push((acc << (to - bits)) & maxv);
  return result;
}

function hexToPoolBech32(hex) {
  const bytes = hex.match(/.{2}/g).map(b => parseInt(b, 16));
  const words = convertBits(bytes, 8, 5);
  const checksum = createChecksum('pool', words);
  return 'pool1' + [...words, ...checksum].map(w => CHARSET[w]).join('');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  process.stderr.write(`Fetching registry from: ${REGISTRY_URL}\n`);

  const res = await fetch(REGISTRY_URL);
  if (!res.ok) throw new Error(`Failed to fetch registry: ${res.status} ${res.statusText}`);

  const pools = await res.json();
  process.stderr.write(`Found ${pools.length} pools in registry.\n`);

  const members = pools
    .filter(p => p.poolId && p.poolId.length === 56)
    .map(p => hexToPoolBech32(p.poolId));

  process.stderr.write(`Converted ${members.length} pool IDs to bech32.\n`);

  const group = {
    id: 'singlepoolalliance',
    name: 'Single Pool Alliance',
    url: 'https://singlepoolalliance.net',
    image: null,
    description:
      'The Single Pool Alliance (SPA) is a community of independent Cardano single stake pool operators committed to decentralization.',
    members,
    note: 'Auto-generated from https://github.com/SinglePoolAlliances/Registration/blob/master/registry.json'
  };

  process.stdout.write(JSON.stringify(group, null, 4) + '\n');
}

main().catch(err => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
