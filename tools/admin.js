/**
 * Admin helpers — runs locally with the service-account key at
 * ../.secrets/matrix-arc-admin.json (gitignored).
 *
 * Usage:
 *   node tools/admin.js inspect-project PRJ402079
 *   node tools/admin.js list-page-blobs PRJ402079
 *   node tools/admin.js rebuild-pages PRJ402079           (dry-run)
 *   node tools/admin.js rebuild-pages PRJ402079 --apply
 */

const path = require("path");
const admin = require("firebase-admin");

const keyPath = path.join(__dirname, "..", ".secrets", "matrix-arc-admin.json");
let serviceAccount;
try {
  serviceAccount = require(keyPath);
} catch (e) {
  console.error(`\nERROR: service account key not found at ${keyPath}`);
  console.error("Create it via Firebase Console → Project Settings → Service accounts → Generate new private key.\n");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: `${serviceAccount.project_id}.firebasestorage.app`,
});
const db = admin.firestore();
const bucket = admin.storage().bucket();

async function findProjectByBcNumber(bcNumber) {
  // Search companies/*/projects then users/*/projects
  const companies = await db.collection("companies").get();
  for (const c of companies.docs) {
    const ps = await db
      .collection(`companies/${c.id}/projects`)
      .where("bcProjectNumber", "==", bcNumber)
      .get();
    for (const p of ps.docs) {
      return { path: `companies/${c.id}/projects/${p.id}`, doc: p, companyId: c.id };
    }
  }
  const users = await db.collection("users").get();
  for (const u of users.docs) {
    const ps = await db
      .collection(`users/${u.id}/projects`)
      .where("bcProjectNumber", "==", bcNumber)
      .get();
    for (const p of ps.docs) {
      return { path: `users/${u.id}/projects/${p.id}`, doc: p, uid: u.id };
    }
  }
  return null;
}

async function inspectProject(bcNumber) {
  const hit = await findProjectByBcNumber(bcNumber);
  if (!hit) {
    console.log(`No project found with bcProjectNumber = ${bcNumber}`);
    return;
  }
  const d = hit.doc.data();
  console.log("PATH ", hit.path);
  console.log("NAME ", d.name);
  console.log(
    "UPDATED",
    new Date(d.updatedAt || 0).toISOString(),
    "BY",
    d.updatedBy || "—"
  );
  console.log("PANELS", (d.panels || []).length);
  (d.panels || []).forEach((pan, i) => {
    const pages = pan.pages || [];
    console.log(
      `  Panel ${i}  id=${pan.id}  name=${pan.name || "—"}  pages=${pages.length}  bom=${(pan.bom || []).length}  drawingNo=${pan.drawingNo || "—"}  status=${pan.status || "—"}`
    );
    pages.forEach((pg, j) => {
      console.log(
        `    pg ${j}  id=${pg.id}  hasStorageUrl=${!!pg.storageUrl}  types=${JSON.stringify(pg.types || [])}  name=${pg.name || ""}`
      );
    });
  });
}

async function listPageBlobs(bcNumber) {
  const hit = await findProjectByBcNumber(bcNumber);
  if (!hit) {
    console.log(`No project found with bcProjectNumber = ${bcNumber}`);
    return;
  }
  const projectId = hit.doc.id;
  const uid = hit.uid || hit.doc.data().createdBy || null;
  console.log("PROJECT", projectId, "UID guess:", uid || "(will scan all uids)");
  // pageImages/{uid}/{projectId}/...
  const [files] = await bucket.getFiles({ prefix: "pageImages/" });
  const matches = files.filter((f) => f.name.includes(`/${projectId}/`));
  console.log(`Found ${matches.length} blobs under pageImages matching projectId ${projectId}:`);
  matches.forEach((f) => console.log("  ", f.name, "size=", f.metadata.size, "updated=", f.metadata.updated));
}

// Build a Firebase-format download URL that includes the token parameter so
// `<img src="...">` tags (which don't use the Firebase SDK's auth) can load the blob.
// Reuses an existing firebaseStorageDownloadTokens value if present; otherwise mints a
// new one and patches the blob metadata so it'll keep working.
async function downloadUrlFor(file) {
  let [meta] = await file.getMetadata();
  let tokens =
    (meta.metadata && meta.metadata.firebaseStorageDownloadTokens) || null;
  if (!tokens) {
    const { randomUUID } = require("crypto");
    const newToken = randomUUID();
    await file.setMetadata({
      metadata: { firebaseStorageDownloadTokens: newToken },
    });
    tokens = newToken;
  }
  const firstToken = tokens.split(",")[0];
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${firstToken}`;
}

// Matches each page (by id) to the blob at pageImages/{uid}/{projectId}/{pageId}.jpg
// and stamps page.storageUrl. Preserves all other page fields (types, name, reviewNotes,
// regions, etc.). Use this when pages array is intact but storageUrls got dropped.
async function fixStorageUrls(bcNumber, apply = false, force = false) {
  const hit = await findProjectByBcNumber(bcNumber);
  if (!hit) {
    console.log(`No project found with bcProjectNumber = ${bcNumber}`);
    return;
  }
  const projectId = hit.doc.id;
  const [files] = await bucket.getFiles({ prefix: "pageImages/" });
  const matches = files.filter((f) => f.name.includes(`/${projectId}/`));
  // Map pageId → most-recent blob path (handles duplicate IDs by newest update)
  const blobByPageId = new Map();
  for (const f of matches) {
    const filename = f.name.split("/").pop();
    const pageId = filename.replace(/\.jpe?g$/i, "");
    const updated = Date.parse(f.metadata.updated || "");
    const prev = blobByPageId.get(pageId);
    if (!prev || updated > prev.updated) blobByPageId.set(pageId, { name: f.name, updated });
  }
  const d = hit.doc.data();
  // Pre-compute download URLs (with token) for each candidate blob. With --force, we also
  // refresh pages that already have a storageUrl (useful when the stored URL is missing
  // a token, which happens with URLs built by admin scripts that bypassed the Firebase
  // SDK's getDownloadURL() — the URL works for SDK-authenticated reads but not for plain
  // `<img src>` tags that ARC's UI uses in several places).
  const blobToFix = [];
  (d.panels || []).forEach((pan) => {
    (pan.pages || []).forEach((pg) => {
      if (pg.storageUrl && !force) return;
      const blob = blobByPageId.get(String(pg.id));
      if (blob) blobToFix.push({ pageId: String(pg.id), blobName: blob.name });
    });
  });
  const urlByPageId = new Map();
  for (const b of blobToFix) {
    const f = bucket.file(b.blobName);
    urlByPageId.set(b.pageId, await downloadUrlFor(f));
  }
  const panels = (d.panels || []).map((pan) => {
    const pages = (pan.pages || []).map((pg) => {
      if (pg.storageUrl && !force) return pg;
      const url = urlByPageId.get(String(pg.id));
      if (!url) return pg;
      return { ...pg, storageUrl: url };
    });
    return { ...pan, pages };
  });
  const beforeFixed = (d.panels || []).flatMap((p) => (p.pages || []).filter((pg) => pg.storageUrl)).length;
  const afterFixed = panels.flatMap((p) => (p.pages || []).filter((pg) => pg.storageUrl)).length;
  const newlyFixed = afterFixed - beforeFixed;
  const changedCount = blobToFix.length; // includes --force regens
  console.log(
    `Pages with storageUrl: ${beforeFixed} → ${afterFixed}  (newly fixed: ${newlyFixed}${force ? `, force-regenerated: ${changedCount - newlyFixed}` : ""})`
  );
  const unmatched = panels
    .flatMap((p) => (p.pages || []).filter((pg) => !pg.storageUrl))
    .map((pg) => pg.id);
  if (unmatched.length) {
    console.log("⚠ Still missing storageUrl (no matching blob):");
    unmatched.forEach((id) => console.log("    ", id));
  }
  if (changedCount === 0) {
    console.log("Nothing to fix.");
    return;
  }
  if (!apply) {
    console.log("\nDRY-RUN — re-run with --apply to write.");
    return;
  }
  await db.doc(hit.path).update({ panels, updatedAt: Date.now() });
  console.log(`✓ Wrote ${changedCount} storageUrl(s) to ${hit.path}`);
}

// Sweep: iterate every project in every company + every user, and fix missing
// storageUrls by matching page.id to a Storage blob. Prints a per-project summary.
async function fixStorageUrlsAll(apply = false) {
  // Cache all page blobs once (Storage listFiles is slow).
  console.log("Listing all pageImages blobs…");
  const [allFiles] = await bucket.getFiles({ prefix: "pageImages/" });
  // Group blobs by the {projectId} segment of the path: pageImages/{uid}/{projectId}/{pageId}.jpg
  const blobsByProject = new Map(); // projectId → Map<pageId, {name, updated}>
  for (const f of allFiles) {
    const parts = f.name.split("/");
    if (parts.length < 4) continue;
    const projectId = parts[2];
    const filename = parts[3];
    if (!/\.jpe?g$/i.test(filename)) continue;
    const pageId = filename.replace(/\.jpe?g$/i, "");
    const updated = Date.parse(f.metadata.updated || "");
    let bucketMap = blobsByProject.get(projectId);
    if (!bucketMap) {
      bucketMap = new Map();
      blobsByProject.set(projectId, bucketMap);
    }
    const prev = bucketMap.get(pageId);
    if (!prev || updated > prev.updated) bucketMap.set(pageId, { name: f.name, updated });
  }
  console.log(`Indexed ${allFiles.length} blobs across ${blobsByProject.size} projects.\n`);

  const targets = [];
  const companies = await db.collection("companies").get();
  for (const c of companies.docs) {
    const ps = await db.collection(`companies/${c.id}/projects`).get();
    for (const p of ps.docs) targets.push({ path: `companies/${c.id}/projects/${p.id}`, doc: p });
  }
  const users = await db.collection("users").get();
  for (const u of users.docs) {
    const ps = await db.collection(`users/${u.id}/projects`).get();
    for (const p of ps.docs) targets.push({ path: `users/${u.id}/projects/${p.id}`, doc: p });
  }
  console.log(`Scanning ${targets.length} projects…\n`);

  let totalProjectsFixed = 0;
  let totalPagesFixed = 0;
  let totalPagesStillMissing = 0;

  for (const t of targets) {
    const d = t.doc.data();
    const projectId = t.doc.id;
    const blobMap = blobsByProject.get(projectId) || new Map();
    let projectPagesFixed = 0;
    let projectPagesStillMissing = 0;
    const panels = (d.panels || []).map((pan) => {
      const pages = (pan.pages || []).map((pg) => {
        if (pg.storageUrl) return pg;
        const blob = blobMap.get(String(pg.id));
        if (!blob) {
          projectPagesStillMissing++;
          return pg;
        }
        projectPagesFixed++;
        const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(blob.name)}?alt=media`;
        return { ...pg, storageUrl: url };
      });
      return { ...pan, pages };
    });
    if (projectPagesFixed > 0) {
      console.log(
        `[FIX]  ${t.path.padEnd(70)} bc=${(d.bcProjectNumber || "—").padEnd(12)} name=${(d.name || "—").slice(0, 40).padEnd(40)} fixed=${projectPagesFixed}${projectPagesStillMissing ? ` still-missing=${projectPagesStillMissing}` : ""}`
      );
      totalProjectsFixed++;
      totalPagesFixed += projectPagesFixed;
      totalPagesStillMissing += projectPagesStillMissing;
      if (apply) {
        await db.doc(t.path).update({ panels, updatedAt: Date.now() });
      }
    } else if (projectPagesStillMissing > 0) {
      console.log(
        `[MISS] ${t.path.padEnd(70)} bc=${(d.bcProjectNumber || "—").padEnd(12)} name=${(d.name || "—").slice(0, 40).padEnd(40)} pages-without-blobs=${projectPagesStillMissing}`
      );
      totalPagesStillMissing += projectPagesStillMissing;
    }
  }
  console.log(
    `\nSummary: ${apply ? "wrote" : "would write"} storageUrl on ${totalPagesFixed} page(s) across ${totalProjectsFixed} project(s). Still missing (no blob): ${totalPagesStillMissing}.`
  );
  if (!apply) console.log("(dry-run — re-run with --apply)");
}

// Delete orphan blobs under pageImages/ that don't correspond to any live page in any
// project. Safe by default: only deletes blobs whose project IS known (in Firestore)
// but whose pageId isn't in that project's live pages. Unknown-project blobs are
// preserved unless --include-unknown-projects is passed.
async function cleanupOrphanBlobs(apply = false, includeUnknown = false) {
  console.log("Listing all pageImages blobs…");
  const [allFiles] = await bucket.getFiles({ prefix: "pageImages/" });
  console.log(`Found ${allFiles.length} blobs.`);

  // Build live set: projectId → Set<pageId> from current Firestore state.
  const liveByProject = new Map(); // projectId → Set<pageId>
  const knownProjects = new Set();
  const companies = await db.collection("companies").get();
  for (const c of companies.docs) {
    const ps = await db.collection(`companies/${c.id}/projects`).get();
    for (const p of ps.docs) {
      knownProjects.add(p.id);
      const d = p.data();
      const pageIds = new Set();
      (d.panels || []).forEach((pan) => {
        (pan.pages || []).forEach((pg) => pageIds.add(String(pg.id)));
      });
      liveByProject.set(p.id, pageIds);
    }
  }
  const users = await db.collection("users").get();
  for (const u of users.docs) {
    const ps = await db.collection(`users/${u.id}/projects`).get();
    for (const p of ps.docs) {
      knownProjects.add(p.id);
      const d = p.data();
      const pageIds = new Set();
      (d.panels || []).forEach((pan) => {
        (pan.pages || []).forEach((pg) => pageIds.add(String(pg.id)));
      });
      liveByProject.set(p.id, pageIds);
    }
  }
  console.log(`Live set: ${liveByProject.size} projects, ${[...liveByProject.values()].reduce((s, x) => s + x.size, 0)} live pageIds.\n`);

  const liveHit = [];
  const orphansKnown = []; // blob's project exists but pageId isn't in live set
  const orphansUnknown = []; // blob's project doesn't exist (project deleted)
  for (const f of allFiles) {
    const parts = f.name.split("/");
    if (parts.length < 4) continue;
    const projectId = parts[2];
    const filename = parts[3];
    if (!/\.jpe?g$/i.test(filename)) continue;
    const pageId = filename.replace(/\.jpe?g$/i, "");
    const size = Number(f.metadata.size || 0);
    const rec = { name: f.name, size, projectId, pageId, ref: f };
    if (!knownProjects.has(projectId)) {
      orphansUnknown.push(rec);
    } else if ((liveByProject.get(projectId) || new Set()).has(pageId)) {
      liveHit.push(rec);
    } else {
      orphansKnown.push(rec);
    }
  }
  const human = (n) => {
    if (n < 1024) return n + "B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + "KB";
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + "MB";
    return (n / 1024 / 1024 / 1024).toFixed(2) + "GB";
  };
  const sum = (arr) => arr.reduce((s, r) => s + r.size, 0);
  console.log(`LIVE:       ${liveHit.length} blobs  (${human(sum(liveHit))})`);
  console.log(`ORPHAN (known project, stale page): ${orphansKnown.length} blobs  (${human(sum(orphansKnown))})`);
  console.log(`ORPHAN (project not in Firestore):  ${orphansUnknown.length} blobs  (${human(sum(orphansUnknown))})`);

  const toDelete = includeUnknown ? [...orphansKnown, ...orphansUnknown] : orphansKnown;
  console.log(
    `\nWould delete: ${toDelete.length} blobs (${human(sum(toDelete))})${includeUnknown ? "  (INCLUDING unknown-project blobs)" : "  (excluding unknown-project blobs — pass --include-unknown-projects to include them)"}`
  );

  // Show a sample so user can sanity-check
  if (orphansKnown.length) {
    console.log("\nSample of orphans (known project, stale page):");
    orphansKnown.slice(0, 8).forEach((r) => console.log(`  ${r.name}  (${human(r.size)})`));
    if (orphansKnown.length > 8) console.log(`  ... and ${orphansKnown.length - 8} more`);
  }
  if (orphansUnknown.length) {
    console.log("\nSample of orphans (project not in Firestore):");
    const byProject = new Map();
    for (const r of orphansUnknown) {
      if (!byProject.has(r.projectId)) byProject.set(r.projectId, []);
      byProject.get(r.projectId).push(r);
    }
    [...byProject.entries()].slice(0, 6).forEach(([pid, arr]) => console.log(`  projectId=${pid}  ${arr.length} blobs  (${human(sum(arr))})`));
    if (byProject.size > 6) console.log(`  ... and ${byProject.size - 6} more project(s)`);
  }

  if (!apply) {
    console.log("\nDRY-RUN — re-run with --apply to delete.");
    return;
  }
  if (!toDelete.length) {
    console.log("\nNothing to delete.");
    return;
  }
  console.log(`\nDeleting ${toDelete.length} blobs…`);
  let deleted = 0;
  let failed = 0;
  // Parallelize with a small concurrency budget to avoid GCS throttling.
  const concurrency = 8;
  let idx = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (idx < toDelete.length) {
        const my = idx++;
        const r = toDelete[my];
        try {
          await r.ref.delete();
          deleted++;
          if (deleted % 50 === 0) console.log(`  ${deleted}/${toDelete.length}…`);
        } catch (e) {
          failed++;
          console.warn(`  delete failed: ${r.name}  ${e.message}`);
        }
      }
    })
  );
  console.log(`\n✓ Deleted ${deleted} blobs (${human(sum(toDelete.slice(0, deleted)))}). Failed: ${failed}.`);
}

async function rebuildPages(bcNumber, apply = false) {
  const hit = await findProjectByBcNumber(bcNumber);
  if (!hit) {
    console.log(`No project found with bcProjectNumber = ${bcNumber}`);
    return;
  }
  const projectId = hit.doc.id;
  const [files] = await bucket.getFiles({ prefix: "pageImages/" });
  const matches = files.filter((f) => f.name.includes(`/${projectId}/`));
  if (!matches.length) {
    console.log(`No pageImages blobs found for project ${projectId} — nothing to rebuild.`);
    return;
  }
  console.log(`Found ${matches.length} blobs. Building pages[] for panel 0…`);
  const pages = [];
  for (const f of matches) {
    await f.makePublic().catch(() => {}); // no-op if already readable
    const filename = f.name.split("/").pop();
    const pageId = filename.replace(/\.jpe?g$/i, "");
    // getDownloadURL-compatible public URL
    const storageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(f.name)}?alt=media`;
    pages.push({
      id: pageId,
      name: filename,
      storageUrl,
      types: [], // user will need to re-tag
    });
  }
  const d = hit.doc.data();
  const newPanels = (d.panels || []).map((pan, i) =>
    i === 0 ? { ...pan, pages } : pan
  );
  if (!apply) {
    console.log("DRY-RUN — would write these pages to panel 0:");
    pages.forEach((p) => console.log("  ", p.id, p.storageUrl));
    console.log("\nRe-run with --apply to commit.");
    return;
  }
  await db.doc(hit.path).update({ panels: newPanels, updatedAt: Date.now() });
  console.log(`✓ Wrote ${pages.length} pages to panel 0 of ${hit.path}`);
}

(async () => {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = argv.slice(1);
  const hasFlag = (f) => args.includes(f);
  const positional = args.filter((a) => !a.startsWith("--"));
  const arg = positional[0];
  const apply = hasFlag("--apply");
  try {
    if (cmd === "inspect-project" && arg) await inspectProject(arg);
    else if (cmd === "list-page-blobs" && arg) await listPageBlobs(arg);
    else if (cmd === "fix-storage-urls" && arg) await fixStorageUrls(arg, apply, hasFlag("--force"));
    else if (cmd === "fix-storage-urls-all") await fixStorageUrlsAll(apply);
    else if (cmd === "cleanup-orphan-blobs") await cleanupOrphanBlobs(apply, hasFlag("--include-unknown-projects"));
    else if (cmd === "rebuild-pages" && arg) await rebuildPages(arg, apply);
    else {
      console.log("Usage:");
      console.log("  node tools/admin.js inspect-project <bcNumber>");
      console.log("  node tools/admin.js list-page-blobs <bcNumber>");
      console.log("  node tools/admin.js fix-storage-urls <bcNumber> [--apply]");
      console.log("  node tools/admin.js fix-storage-urls-all [--apply]");
      console.log("  node tools/admin.js cleanup-orphan-blobs [--apply] [--include-unknown-projects]");
      console.log("  node tools/admin.js rebuild-pages <bcNumber> [--apply]");
    }
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
