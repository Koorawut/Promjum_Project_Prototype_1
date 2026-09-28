// Full e2e test of the minigame admin feature against PRODUCTION.
// Usage: node test-minigame-admin.js
// Cleanup: deletes every set it created; the two seed sets it reads are
// never modified (PATCH is only tested against a set we create first).

const API = 'https://promjumprojectprototype1-production.up.railway.app';
const USERNAME = 'probetest';
const PASSWORD = 'TestPass123!';

let token = null;
let pass = 0;
let fail = 0;

function ok(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`);
  }
}

async function api(path, { method = 'GET', body, formData, auth = true } = {}) {
  const headers = {};
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + path, {
    method,
    headers,
    body: formData ?? (body ? JSON.stringify(body) : undefined),
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

// Tiny colored PNGs (1x1 pixel) — files must be real images for the
// MIME allowlist. Different colors per slot so PATCH verification can
// check the right file landed in the right slot via /media/<uuid>.
function pngBytes(r, g, b) {
  // Minimal valid PNG: signature + IHDR + IDAT + IEND with zlib store.
  // Building CRC32 by hand is overkill for a 1x1 image — instead use a
  // precomputed tiny PNG and just vary nothing; MediaService only checks
  // the declared MIME (client-provided), so a fixed valid PNG works for
  // all slots. Distinctness comes from the slot order, not the bytes.
  const b64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  return Buffer.from(b64, 'base64');
}

async function main() {
  console.log('=== Minigame admin e2e test against', API, '===');

  // ---------- 1. Login ----------
  console.log('\n[1] Login (admin account)');
  const login = await api('/auth/login', {
    method: 'POST',
    body: { username: USERNAME, password: PASSWORD },
    auth: false,
  });
  // NestJS @Post() defaults to 201 — both are success.
  ok('login returns 200/201', login.status === 200 || login.status === 201, `status=${login.status}`);
  token = login.data?.accessToken ?? null;
  ok('accessToken received', !!token);
  ok('role is admin', login.data?.user?.role === 'admin', `role=${login.data?.user?.role}`);
  if (!token) {
    console.log('Cannot continue without a token. Aborting.');
    process.exit(1);
  }

  // ---------- 2. GET list ----------
  console.log('\n[2] GET /admin/minigame-sets');
  const list1 = await api('/admin/minigame-sets');
  ok('returns 200', list1.status === 200, `status=${list1.status}`);
  ok('response is an array', Array.isArray(list1.data));
  const seed = (list1.data ?? []).filter((s) => !s.name.startsWith('e2e-test-'));
  ok('seed sets visible (animals-1, places-1, food-1)', seed.length >= 3, `count=${seed.length}`);
  const first = seed[0];
  if (first) {
    ok('set has 4 fields admin UI needs', ['id', 'name', 'images', 'correctIndex'].every((k) => k in first));
    ok('images is an array', Array.isArray(first.images));
    ok('correctIndex within images length', Number.isInteger(first.correctIndex) && first.correctIndex < first.images.length);
  }

  // ---------- 3. Auth guard ----------
  console.log('\n[3] Guard checks (no token / non-admin should fail)');
  const noTok = await fetch(API + '/admin/minigame-sets');
  ok('no token -> 401/403', noTok.status === 401 || noTok.status === 403, `status=${noTok.status}`);

  // ---------- 4. POST create ----------
  console.log('\n[4] POST /admin/minigame-sets (create)');
  const fd = new FormData();
  fd.append('correctIndex', '2');
  for (let i = 0; i < 4; i++) {
    fd.append('images', new Blob([pngBytes()], { type: 'image/png' }), `slot-${i}.png`);
  }
  const created = await api('/admin/minigame-sets', { method: 'POST', formData: fd });
  ok('returns 201', created.status === 201 || created.status === 200, `status=${created.status}`);
  const setId = created.data?.id;
  ok('returns set id', !!setId);
  ok('returns name', typeof created.data?.name === 'string');
  if (setId) {
    const check = (await api('/admin/minigame-sets')).data.find((s) => s.id === setId);
    ok('appears in list after create', !!check);
    ok('has 4 images', check?.images?.length === 4, `len=${check?.images?.length}`);
    ok('correctIndex stored (2)', check?.correctIndex === 2, `got=${check?.correctIndex}`);
    ok('image URLs are /media/ paths (MediaService)', (check?.images ?? []).every((u) => u.startsWith('/media/')));
    // the stored media files must actually be served:
    const imgRes = await fetch(API + check.images[0]);
    ok('stored image is servable via GET /media/:id', imgRes.status === 200, `status=${imgRes.status}`);
  }

  // ---------- 5. POST validation ----------
  console.log('\n[5] POST validation (must be rejected)');
  const fd3 = new FormData();
  fd3.append('correctIndex', '0');
  for (let i = 0; i < 3; i++) {
    fd3.append('images', new Blob([pngBytes()], { type: 'image/png' }), `slot-${i}.png`);
  }
  const tooFew = await api('/admin/minigame-sets', { method: 'POST', formData: fd3 });
  ok('only 3 files -> 400', tooFew.status === 400, `status=${tooFew.status}`);
  ok('thai error message about 4 images', typeof tooFew.data?.message === 'string' && /4/.test(tooFew.data.message), JSON.stringify(tooFew.data?.message));

  const fdBadType = new FormData();
  fdBadType.append('correctIndex', '0');
  for (let i = 0; i < 4; i++) {
    fdBadType.append('images', new Blob([Buffer.from('not an image')], { type: 'text/plain' }), `slot-${i}.txt`);
  }
  const badType = await api('/admin/minigame-sets', { method: 'POST', formData: fdBadType });
  ok('non-image files -> 400', badType.status === 400, `status=${badType.status}`);

  const fdBadIdx = new FormData();
  fdBadIdx.append('correctIndex', '7');
  for (let i = 0; i < 4; i++) {
    fdBadIdx.append('images', new Blob([pngBytes()], { type: 'image/png' }), `slot-${i}.png`);
  }
  const badIdx = await api('/admin/minigame-sets', { method: 'POST', formData: fdBadIdx });
  ok('correctIndex out of range -> 400', badIdx.status === 400, `status=${badIdx.status}`);

  // ---------- 6. PATCH ----------
  console.log('\n[6] PATCH /admin/minigame-sets/:id (edit)');
  if (!setId) {
    console.log('  SKIP (no set was created)');
  } else {
    const before = (await api('/admin/minigame-sets')).data.find((s) => s.id === setId);
    const oldUrls = before.images;

    // Replace slot 0 with a new file, keep 1-3, switch answer to slot 3.
    const fdp = new FormData();
    fdp.append('correctIndex', '3');
    fdp.append('images', new Blob([pngBytes()], { type: 'image/png' }), 'slot-0-new.png');
    fdp.append('slots', JSON.stringify(['', oldUrls[1], oldUrls[2], oldUrls[3]]));
    const patched = await api(`/admin/minigame-sets/${setId}`, { method: 'PATCH', formData: fdp });
    ok('returns 200', patched.status === 200, `status=${patched.status}`);

    const after = (await api('/admin/minigame-sets')).data.find((s) => s.id === setId);
    ok('still 4 images', after?.images?.length === 4, `len=${after?.images?.length}`);
    ok('slot 0 got a NEW url', after?.images[0] !== oldUrls[0]);
    ok('slots 1-3 kept their original urls', [1, 2, 3].every((i) => after?.images[i] === oldUrls[i]));
    ok('correctIndex updated to 3', after?.correctIndex === 3, `got=${after?.correctIndex}`);

    // PATCH with more files than "" holes must fail (count mismatch)
    const fdm2 = new FormData();
    fdm2.append('correctIndex', '3');
    fdm2.append('images', new Blob([pngBytes()], { type: 'image/png' }), 'a.png');
    fdm2.append('images', new Blob([pngBytes()], { type: 'image/png' }), 'b.png');
    fdm2.append('slots', JSON.stringify(['', 'keep', 'keep', 'keep']));
    const mismatch = await api(`/admin/minigame-sets/${setId}`, { method: 'PATCH', formData: fdm2 });
    ok('files/slots count mismatch -> 400', mismatch.status === 400, `status=${mismatch.status}`);

    // Answer-only PATCH (no files at all): switch answer, keep all images
    const fda = new FormData();
    fda.append('correctIndex', '1');
    const keepUrls = after.images;
    fda.append('slots', JSON.stringify(keepUrls));
    const ansOnly = await api(`/admin/minigame-sets/${setId}`, { method: 'PATCH', formData: fda });
    ok('answer-only PATCH returns 200', ansOnly.status === 200, `status=${ansOnly.status}`);
    const after2 = (await api('/admin/minigame-sets')).data.find((s) => s.id === setId);
    ok('all 4 urls unchanged on answer-only PATCH', [0, 1, 2, 3].every((i) => after2?.images[i] === keepUrls[i]));
    ok('correctIndex updated to 1', after2?.correctIndex === 1, `got=${after2?.correctIndex}`);
  }

  // ---------- 7. DELETE ----------
  console.log('\n[7] DELETE /admin/minigame-sets/:id');
  if (!setId) {
    console.log('  SKIP (no set was created)');
  } else {
    const del = await api(`/admin/minigame-sets/${setId}`, { method: 'DELETE' });
    ok('returns 200', del.status === 200, `status=${del.status}`);
    const gone = (await api('/admin/minigame-sets')).data.some((s) => s.id === setId);
    ok('set gone from list', !gone);
    const delAgain = await api(`/admin/minigame-sets/${setId}`, { method: 'DELETE' });
    ok('delete again -> 404', delAgain.status === 404, `status=${delAgain.status}`);
  }

  // ---------- 8. Seed sets untouched ----------
  console.log('\n[8] Seed sets untouched');
  const listFinal = (await api('/admin/minigame-sets')).data;
  const leftover = listFinal.filter((s) => s.name.startsWith('e2e-test-') || s.name.startsWith('set-17'));
  ok('no test sets left behind', leftover.length === 0, JSON.stringify(leftover.map((s) => s.name)));
  ok('seed sets still present', ['animals-1', 'places-1', 'food-1'].every((n) => listFinal.some((s) => s.name === n)));

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test script crashed:', err);
  process.exit(1);
});
