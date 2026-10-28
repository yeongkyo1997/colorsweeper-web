// localStorage 는 사생활 보호 모드 등에서 막힐 수 있으므로 실패해도 게임은 계속된다
export function load(key, fallback) {
  try {
    const v = localStorage.getItem(`colorsweeper:${key}`);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(`colorsweeper:${key}`, JSON.stringify(value));
  } catch {
    /* 저장 실패는 무시 */
  }
}
