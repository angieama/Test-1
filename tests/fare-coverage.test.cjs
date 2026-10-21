const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const code=html.split('// Fare coverage calculations use integer cents to avoid floating-point remainders.')[1].split('// End fare coverage calculations.')[0];
const context={};vm.createContext(context);vm.runInContext(code,context);
test('whole group fares and extra money are counted separately',()=>{
 for(const [amount,fare,people,extra] of [[100,100,1,0],[200,100,2,0],[300,100,3,0],[250,100,2,50],[150,100,1,50],[50,100,0,50]]){
  const actual=context.fareCoverage(amount,fare);assert.equal(actual.people,people);assert.equal(actual.extra,extra);
 }
});
test('decimal fares use cents without losing a passenger or inventing a remainder',()=>{
 for(const [amount,fare,people,extra] of [[0.3,0.1,3,0],[201,100.5,2,0],[251.25,100.5,2,50.25]]){
  const actual=context.fareCoverage(amount,fare);assert.equal(actual.people,people);assert.equal(actual.extra,extra);
 }
});
test('a new fare changes current coverage without editing the paid amount',()=>{
 assert.equal(context.fareCoverage(300,100).people,3);assert.equal(context.fareCoverage(300,150).people,2);
 assert.equal(context.fareCoverage(200,150).people,1);assert.equal(context.fareCoverage(200,150).extra,50);
});
test('all amounts includes underpayments and optional amount filters classify them',()=>{
 for(const amount of [50,80,100,150,200])assert.equal(context.matchesAmount(amount,100,'all'),true);
 assert.equal(context.matchesAmount(80,100,'under'),true);assert.equal(context.matchesAmount(100,100,'under'),false);
 assert.equal(context.matchesAmount(100,100,'exact'),true);assert.equal(context.matchesAmount(200,100,'exact'),false);
 assert.equal(context.matchesAmount(200,100,'over'),true);assert.equal(context.matchesAmount(100,100,'over'),false);
});
test('shortfalls use cents and never label above-fare money as missing',()=>{
 assert.equal(context.paymentShortfall(80,100),20);assert.equal(context.paymentShortfall(50,100),50);
 assert.equal(context.paymentShortfall(100,100),0);assert.equal(context.paymentShortfall(250,100),0);
 assert.equal(context.paymentShortfall(0.1,0.3),0.2);assert.equal(context.paymentShortfall(100,150),50);
});
