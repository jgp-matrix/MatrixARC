const parser=require('./node_modules/@babel/parser');
const fs=require('fs');
const src=fs.readFileSync('public/index.html','utf8');
// Find the text/babel script tag
const babelIdx=src.indexOf('type="text/babel"');
const tagStart=src.lastIndexOf('<script',babelIdx);
const tagEnd=src.indexOf('>',tagStart)+1;
const scriptClose=src.indexOf('</script>',tagEnd);
const js=src.substring(tagEnd,scriptClose);
console.log('Babel script length:',js.length,'first 60:',JSON.stringify(js.substring(0,60)));
try{
  parser.parse(js,{plugins:['jsx'],sourceType:'module'});
  console.log('JSX OK');
}catch(e){
  console.error('JSX ERROR line',e.loc&&e.loc.line,':',e.message.substring(0,200));
  process.exit(1);
}
