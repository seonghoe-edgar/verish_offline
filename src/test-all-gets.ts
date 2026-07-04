import { PlayMdApiError } from "./client.js";
import {
  getSupplier,
  getStorage,
  getShop,
  getProduct,
  getCommonCode,
  getStockStorage,
  getStorageLedgerDetailInfo,
  getProductPrice,
  getProductPriceChange,
  getShopOrders,
  getShopStock,
  getNonSalesStock,
  getSales,
  getSalesDetailInfo,
  getSalesPgInfo,
  getExchange,
  getExchangeBalance,
  getTaxFreeInfo,
  getShopLedger,
  getShopReturn,
  getShopRotate,
  getExpectedReturnShop,
  getAssignRotate,
  getShopLedgerDetailInfo,
  getStockAdjustment,
  getUsedCoupon,
  getSendCoupon,
} from "./endpoints/index.js";

const TO_STR = "20260704";
const FROM_STR = "20260703";
const TO_NUM = 20260704;
const FROM_NUM = 20260703;

interface Result {
  name: string;
  ok: boolean;
  info: string;
}
const results: Result[] = [];

async function tryCall<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const data = await fn();
    const info = Array.isArray(data) ? `${data.length} items` : JSON.stringify(data).slice(0, 100);
    results.push({ name, ok: true, info });
    return data;
  } catch (err) {
    const info = err instanceof PlayMdApiError ? `HTTP ${err.status ?? "?"}: ${err.message}` : String(err);
    results.push({ name, ok: false, info });
    return undefined;
  }
}

function skip(name: string, reason: string) {
  results.push({ name, ok: false, info: `SKIPPED: ${reason}` });
}

async function main() {
  const suppliers = (await tryCall("getSupplier", () => getSupplier())) ?? [];
  const storages = (await tryCall("getStorage", () => getStorage())) ?? [];
  const shops = (await tryCall("getShop", () => getShop())) ?? [];
  const products = (await tryCall("getProduct", () => getProduct())) ?? [];
  await tryCall("getCommonCode", () => getCommonCode());

  const storageCode = storages[0]?.storageCode;
  const shopCode = shops[0]?.shopCode;
  const productCode = products[0]?.productCode;

  if (storageCode) {
    await tryCall("getStockStorage", () => getStockStorage({ stockDate: TO_STR, storage: storageCode }));
    await tryCall("getStorageLedgerDetailInfo", () =>
      getStorageLedgerDetailInfo({ fromDate: FROM_NUM, toDate: TO_NUM, searchType: "0", storageCode })
    );
  } else {
    skip("getStockStorage", "no storageCode from getStorage");
    skip("getStorageLedgerDetailInfo", "no storageCode from getStorage");
  }

  if (shopCode) {
    await tryCall("getShopOrders", () => getShopOrders({ from: FROM_STR, to: TO_STR, shop: shopCode }));
    await tryCall("getShopStock", () => getShopStock({ stockDate: TO_STR, shop: shopCode }));
    await tryCall("getSales", () => getSales({ from: FROM_STR, to: TO_STR, shop: shopCode }));
    await tryCall("getSalesDetailInfo", () =>
      getSalesDetailInfo({ fromDate: FROM_NUM, toDate: TO_NUM, shopCode })
    );
    await tryCall("getSalesPgInfo", () => getSalesPgInfo({ date: TO_STR, shop: shopCode }));
    await tryCall("getExchange", () => getExchange({ date: TO_STR, shop: shopCode, gubn: "1" }));
    await tryCall("getExchangeBalance", () => getExchangeBalance({ date: TO_STR, shop: shopCode }));
    await tryCall("getTaxFreeInfo", () => getTaxFreeInfo({ from: FROM_STR, to: TO_STR, shop: shopCode }));
    await tryCall("getShopLedger", () => getShopLedger({ fromDate: FROM_STR, toDate: TO_STR, shopCode }));
    await tryCall("getShopReturn", () => getShopReturn({ fromDate: FROM_STR, toDate: TO_STR, shopCode }));
    await tryCall("getExpectedReturnShop", () =>
      getExpectedReturnShop({ fromDate: FROM_STR, toDate: TO_STR, shopCode })
    );
    await tryCall("getShopLedgerDetailInfo", () =>
      getShopLedgerDetailInfo({ fromDate: FROM_NUM, toDate: TO_NUM, searchType: "ALL", shopCode })
    );
    if (productCode) {
      await tryCall("getProductPrice", () => getProductPrice({ shop: shopCode, date: TO_STR, productCode }));
    } else {
      skip("getProductPrice", "no productCode from getProduct");
    }
  } else {
    [
      "getShopOrders",
      "getShopStock",
      "getSales",
      "getSalesDetailInfo",
      "getSalesPgInfo",
      "getExchange",
      "getExchangeBalance",
      "getTaxFreeInfo",
      "getShopLedger",
      "getShopReturn",
      "getExpectedReturnShop",
      "getShopLedgerDetailInfo",
      "getProductPrice",
    ].forEach((n) => skip(n, "no shopCode from getShop"));
  }

  if (shopCode) {
    await tryCall("getNonSalesStock", () => getNonSalesStock({ shopCode }));
  } else {
    skip("getNonSalesStock", "no shopCode from getShop");
  }

  if (shops.length >= 2) {
    await tryCall("getShopRotate", () =>
      getShopRotate({
        fromDate: FROM_STR,
        toDate: TO_STR,
        fromShopCode: shops[0].shopCode,
        toShopCode: shops[1].shopCode,
      })
    );
  } else {
    skip("getShopRotate", "need at least 2 shops from getShop");
  }

  await tryCall("getAssignRotate", () => getAssignRotate({ fromDate: FROM_STR, toDate: TO_STR }));
  await tryCall("getStockAdjustment", () => getStockAdjustment({ fromDate: FROM_NUM, toDate: TO_NUM }));
  await tryCall("getUsedCoupon", () => getUsedCoupon({ from: FROM_STR, to: TO_STR }));
  await tryCall("getSendCoupon", () => getSendCoupon({ from: FROM_STR, to: TO_STR }));

  if (shopCode && productCode) {
    const detailed = await tryCall("getProduct (searchType=3, for barcode)", () =>
      getProduct({ productCode, searchType: "3" })
    );
    const barcode = detailed?.[0]?.barcode;
    if (barcode) {
      await tryCall("getProductPriceChange", () =>
        getProductPriceChange({ timeType: "1", barcode, shopCode })
      );
    } else {
      skip("getProductPriceChange", "no barcode found via getProduct searchType=3");
    }
  } else {
    skip("getProductPriceChange", "no shopCode/productCode available");
  }

  console.log("\n=== PLAY MD GET endpoint test results ===\n");
  for (const r of results) {
    console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name.padEnd(38)} ${r.info}`);
  }
  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n${okCount}/${results.length} calls returned a response (no exception).`);
  console.log(`Reference data used: supplierCode=${suppliers[0]?.supplierCode}, storageCode=${storageCode}, shopCode=${shopCode}, productCode=${productCode}`);
}

main();
