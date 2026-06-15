const admin = require('firebase-admin');
const path = require('path');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: 'matrix-arc.firebasestorage.app'
});

const bucket = admin.storage().bucket();
const outDir = path.join(__dirname, 'pdfs');

const files = [
  { prj: 'PRJ402096', path: 'originalPdfs/6O00xlRalTWWJkJl4r63yKxtg4i1/2vVsTW9goqJ1G9b8AMDC/1779120689512_tzfxg1_1001244897_Rev_01.pdf', bomPage: 21 },
  { prj: 'PRJ402098', path: 'originalPdfs/uYW1acGkw9UM8xFidpqvO746OU13/OHkXxipQ7jXRFqmR2T0P/1779145875694_gob0qz_Buyoff_Disconnet_Box_R1.pdf', bomPage: 4 },
];

(async () => {
  for (const f of files) {
    const outFile = path.join(outDir, `${f.prj}.pdf`);
    console.log(`Downloading ${f.prj}...`);
    try {
      await bucket.file(f.path).download({ destination: outFile });
      console.log(`  Saved (BOM page: ${f.bomPage})`);
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
    }
  }
  process.exit(0);
})();
