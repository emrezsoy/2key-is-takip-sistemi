import { test } from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { parseCsv, parseXlsx, rowsToProducts } from "./productImport";

test("CSV (noktalı virgül, tırnak, Türkçe başlık) → ürünler ve varyantlar", () => {
  const csv = '﻿Ad;Açıklama;Fiyat;Varyant;Stok;Görsel\nKazak;"Yün; sıcak";1.299,90;"Beden: M; Renk: Siyah";3;https://x/a.jpg\nKazak;;1.299,90;Beden: L;0;\nAtkı;Kaşmir;450;;;\n';
  const { products, errors } = rowsToProducts(parseCsv(csv));
  assert.deepEqual(errors, []);
  assert.equal(products.length, 2);
  const kazak = products[0];
  assert.equal(kazak.name, "Kazak");
  assert.equal(kazak.description, "Yün; sıcak");
  assert.equal(kazak.price, 1299.9);
  assert.equal(kazak.variants.length, 2);
  assert.deepEqual(kazak.variants[0].options, { Beden: "M", Renk: "Siyah" });
  assert.equal(kazak.variants[1].stock, 0);
  assert.deepEqual(kazak.images, ["https://x/a.jpg"]);
  assert.equal(products[1].variants.length, 0);
});

test("Ad sütunu yoksa hata", () => {
  assert.match(rowsToProducts(parseCsv("Fiyat\n10\n")).errors[0], /Ad/);
});

test("Excel (.xlsx) ilk sayfa, paylaşılan metinler", () => {
  const sheet = `<?xml version="1.0"?><worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>99.5</v></c><c r="C2"><v>7</v></c></row>
</sheetData></worksheet>`;
  const shared = `<sst><si><t>Ürün adı</t></si><si><t>Fiyat</t></si><si><t>Stok</t></si><si><t>Kupa &amp; Tabak</t></si></sst>`;
  const zip = zipSync({ "xl/worksheets/sheet1.xml": strToU8(sheet), "xl/sharedStrings.xml": strToU8(shared) });
  const rows = parseXlsx(zip);
  assert.deepEqual(rows[1], ["Kupa & Tabak", "99.5", "7"]);
  const { products } = rowsToProducts(rows);
  assert.equal(products[0].price, 99.5);
  assert.equal(products[0].variants[0].stock, 7);
});
