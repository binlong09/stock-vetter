import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseForm4 } from './sec-form4.js';

const META = { cik: '0000012345', accession: '0000012345-26-000001', filingDate: '2026-08-06' };

function form4(transactions: string, owner = OWNER_CEO): string {
  return `<?xml version="1.0"?>
<ownershipDocument>
  <issuer>
    <issuerCik>0000012345</issuerCik>
    <issuerTradingSymbol>ACME</issuerTradingSymbol>
  </issuer>
  ${owner}
  <nonDerivativeTable>${transactions}</nonDerivativeTable>
</ownershipDocument>`;
}

const OWNER_CEO = `<reportingOwner>
    <reportingOwnerId><rptOwnerCik>0000999001</rptOwnerCik><rptOwnerName>Doe Jane</rptOwnerName></reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>0</isDirector><isOfficer>1</isOfficer>
      <officerTitle>Chief Executive Officer</officerTitle>
      <isTenPercentOwner>0</isTenPercentOwner>
    </reportingOwnerRelationship>
  </reportingOwner>`;

function txn(code: string, shares: number, price: number | null, date = '2026-08-05'): string {
  return `<nonDerivativeTransaction>
    <securityTitle><value>Common Stock</value></securityTitle>
    <transactionDate><value>${date}</value></transactionDate>
    <transactionCoding><transactionFormType>4</transactionFormType><transactionCode>${code}</transactionCode></transactionCoding>
    <transactionAmounts>
      <transactionShares><value>${shares}</value></transactionShares>
      ${price == null ? '' : `<transactionPricePerShare><value>${price}</value></transactionPricePerShare>`}
      <transactionAcquiredDisposedCode><value>${code === 'S' || code === 'F' ? 'D' : 'A'}</value></transactionAcquiredDisposedCode>
    </transactionAmounts>
  </nonDerivativeTransaction>`;
}

test('an open-market purchase is parsed with role, shares and value', () => {
  const [p] = parseForm4(form4(txn('P', 10_000, 3.5)), META);
  assert.ok(p);
  assert.equal(p.shares, 10_000);
  assert.equal(p.price, 3.5);
  assert.equal(p.value, 35_000);
  assert.equal(p.ticker, 'ACME');
  assert.equal(p.isOfficer, true);
  assert.equal(p.ownerTitle, 'Chief Executive Officer');
  assert.equal(p.transactionDate, '2026-08-05');
});

test('grants, option exercises, tax withholding and sales are all excluded', () => {
  // This is the whole point of the detector: only code P is someone buying.
  for (const code of ['A', 'M', 'F', 'S', 'G', 'X', 'C']) {
    assert.equal(
      parseForm4(form4(txn(code, 10_000, 3.5)), META).length,
      0,
      `code ${code} should not count as a purchase`,
    );
  }
});

test('a P coded as a disposition is rejected as a data error', () => {
  const xml = form4(
    `<nonDerivativeTransaction>
      <transactionDate><value>2026-08-05</value></transactionDate>
      <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>1000</value></transactionShares>
        <transactionPricePerShare><value>2</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
    </nonDerivativeTransaction>`,
  );
  assert.equal(parseForm4(xml, META).length, 0);
});

test('a purchase with no disclosed price is kept, with a null value', () => {
  const [p] = parseForm4(form4(txn('P', 5_000, null)), META);
  assert.ok(p);
  assert.equal(p.price, null);
  assert.equal(p.value, null);
  assert.equal(p.shares, 5_000);
});

test('several purchases in one filing all come through, keyed distinctly', () => {
  const ps = parseForm4(form4(txn('P', 1_000, 2, '2026-08-04') + txn('P', 2_000, 2.1, '2026-08-05')), META);
  assert.equal(ps.length, 2);
  assert.equal(new Set(ps.map((p) => p.key)).size, 2);
});

test('derivative purchases are not counted as common-stock buys', () => {
  const xml = `<?xml version="1.0"?>
<ownershipDocument>
  <issuer><issuerCik>0000012345</issuerCik><issuerTradingSymbol>ACME</issuerTradingSymbol></issuer>
  ${OWNER_CEO}
  <derivativeTable>
    <derivativeTransaction>
      <transactionDate><value>2026-08-05</value></transactionDate>
      <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>50000</value></transactionShares>
        <transactionPricePerShare><value>0.1</value></transactionPricePerShare>
      </transactionAmounts>
    </derivativeTransaction>
  </derivativeTable>
</ownershipDocument>`;
  assert.equal(parseForm4(xml, META).length, 0);
});
