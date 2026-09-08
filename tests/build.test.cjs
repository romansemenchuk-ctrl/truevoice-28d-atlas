const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('static artifact excludes course data',()=>assert.equal(fs.existsSync('dist/js/data/lessons.js'),false));
test('artwork is not a public static asset',()=>assert.equal(fs.existsSync('dist/assets/anatomy/breath.webp'),false));
test('all original lessons retained for authorized responses',()=>assert.equal(JSON.parse(fs.readFileSync('_server/course.json')).lessons.length,28));
test('guest never runs atlas controller',()=>{const s=fs.readFileSync('dist/index.html','utf8');assert.doesNotMatch(s,/<script[^>]+src="js\/app\.js/);assert.match(s,/js\/academy\.js/);});
