const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: 'matrix-arc.firebasestorage.app'
});

const bucket = admin.storage().bucket();
const outDir = path.join(__dirname, 'pdfs');

const files = [
  { prj: 'PRJ402092', path: 'originalPdfs/6O00xlRalTWWJkJl4r63yKxtg4i1/rPScUkz0iYxrxNuXXFrv/1778711627681_hdvkut_400068437.pdf', bomPage: 9 },
  { prj: 'PRJ402100', path: 'originalPdfs/6O00xlRalTWWJkJl4r63yKxtg4i1/hfOl83LDNqsT6Z3UZjCd/1779295178706_hk40zr_CP.120_Control_Panel_Abbeville_25-037.pdf', bomPage: 2 },
  { prj: 'PRJ402101', path: 'originalPdfs/9q1xr8G24gadh5z66sTfcINqp2O2/z1QmSG8BE7oTBo6PFr6a/1779312432826_upfjfs_CSW1927-121.dwg.pdf', bomPage: 10 },
  { prj: 'PRJ402113', path: 'originalPdfs/6O00xlRalTWWJkJl4r63yKxtg4i1/La2FiGCfv9gnz5b7bdg7/1779402418193_bjkmzg_CSW1807-121_Rev.D.pdf', bomPage: 9 },
];

(async () => {
  for (const f of files) {
    const outFile = path.join(outDir, `${f.prj}.pdf`);
    console.log(`Downloading ${f.prj} from ${f.path}...`);
    try {
      await bucket.file(f.path).download({ destination: outFile });
      console.log(`  Saved to ${outFile} (BOM page: ${f.bomPage})`);
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
    }
  }
  console.log('Done.');
  process.exit(0);
})();
