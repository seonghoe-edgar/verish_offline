const EXT_MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

function extOf(url) {
  const m = url.split('?')[0].match(/\.[a-z]+$/i);
  return m ? m[0].toLowerCase() : '.jpg';
}

async function downloadAsDataUri(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type');
    const mime = (contentType && contentType.split(';')[0]) || EXT_MIME[extOf(url)] || 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// bucket 우선순위: hero 1장 -> product 최대 max-1장 -> other로 채움
export async function pickAndEmbedImages(images, max = 3) {
  const hero = images.filter((i) => i.bucket === 'hero');
  const product = images.filter((i) => i.bucket === 'product');
  const other = images.filter((i) => i.bucket === 'other');
  const chosen = [...hero.slice(0, 1), ...product.slice(0, max - 1)];
  for (const img of other) {
    if (chosen.length >= max) break;
    chosen.push(img);
  }
  while (chosen.length < max && product.length > chosen.filter((c) => c.bucket === 'product').length) {
    chosen.push(product[chosen.length]);
  }

  const embedded = [];
  for (const img of chosen.slice(0, max)) {
    const dataUri = await downloadAsDataUri(img.url);
    if (dataUri) embedded.push({ dataUri, bucket: img.bucket });
  }
  return embedded;
}
