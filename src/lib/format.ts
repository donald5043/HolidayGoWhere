export function compactNumber(value: number) {
  return value >= 10000 ? `${(value / 10000).toFixed(1)}萬` : value.toLocaleString('zh-TW')
}
