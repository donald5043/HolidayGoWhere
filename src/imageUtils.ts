export const FALLBACK_IMAGE = `${import.meta.env.BASE_URL}place-fallback.png`

export const BAD_PLACEHOLDER_IMAGES = new Set([
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=900&q=80',
  'https://www.penghu-nsa.gov.tw/images/module/travel2/default_pic.jpg',
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1561214115-f2f134cc4912?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1500534314209-a25ddb2bd4297?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1596997000103-e597b3ca50df?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
])

export function bestImageSrc(
  image: string | undefined,
  imageCandidates: string[] | undefined,
): string {
  const candidates = [image, ...(imageCandidates ?? [])]
    .filter((url): url is string => Boolean(url) && !BAD_PLACEHOLDER_IMAGES.has(url as string))
  return candidates[0] ?? FALLBACK_IMAGE
}
