const admin = require('firebase-admin');
const path = require('path');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: 'matrix-arc.firebasestorage.app'
});

const bucket = admin.storage().bucket();
const outDir = path.join(__dirname, 'pdfs');

const files = [
  { prj: 'PRJ402094', path: 'originalPdfs/9q1xr8G24gadh5z66sTfcINqp2O2/w23I333T1TyAuMWrpXFr/1778880765688_rwp7gm_402023-02_NEU_Materion_Delta_PLC_Cabinet_R1.pdf', bomPage: 3 },
  { prj: 'PRJ402093', path: 'originalPdfs/9q1xr8G24gadh5z66sTfcINqp2O2/fxBAxVHKqPn8jWXA1iBq/1778799643857_jtttw9_CSW1902-221.dwg.pdf', bomPage: 6 },
  { prj: 'PRJ402109', path: 'originalPdfs/9q1xr8G24gadh5z66sTfcINqp2O2/BYsDa5PXrxEalzBowTUN/1779828299561_jyynk7_RSD0203-121.dwg.pdf', bomPage: 9 },
  { prj: 'PRJ402117', path: 'originalPdfs/9q1xr8G24gadh5z66sTfcINqp2O2/9fjcWz4HPvMoHdVJz2HP/1780346673134_uetwp1_RSW1673-121.dwg.pdf', bomPage: 2 },
  { prj: 'PRJ402119', path: 'originalPdfs/9q1xr8G24gadh5z66sTfcINqp2O2/YzzLdpyzX9jAkJZGhiUR/1780520222267_xmhnu5_RSW1596-126.pdf', bomPage: 3 },
  { prj: 'PRJ402111', path: 'originalPdfs/uYW1acGkw9UM8xFidpqvO746OU13/C62peYivwPg2Ne2qqe5f/1779982774531_gop2ol_Secret_Panel_Parts_list_and_Model_Views_REV2.pdf', bomPage: 2 },
  { prj: 'PRJ402118', path: 'originalPdfs/9q1xr8G24gadh5z66sTfcINqp2O2/lhjtR21sxX34uklPl0Vb/1780419218590_aq3mr5_RFQ_for_Assembly_Junction_Boxes.pdf', bomPage: 1 },
  { prj: 'PRJ402102', path: 'originalPdfs/9q1xr8G24gadh5z66sTfcINqp2O2/jKCJWiaaPLOkjvjJZIi8/1779309664935_wh09x7_RSG-10005_Load_Cell_Panel.pdf', bomPage: 3 },
  { prj: 'PRJ402108', path: 'originalPdfs/9q1xr8G24gadh5z66sTfcINqp2O2/nihmoANucEuVwXPl9G58/1779483044548_va0bys_Secret_Panel_Parts_list_and_Model_Views_REV2.pdf', bomPage: 2 },
];

(async () => {
  for (const f of files) {
    const outFile = path.join(outDir, `${f.prj}.pdf`);
    console.log(`Downloading ${f.prj} (page ${f.bomPage})...`);
    try {
      await bucket.file(f.path).download({ destination: outFile });
      console.log(`  OK`);
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
    }
  }
  process.exit(0);
})();
