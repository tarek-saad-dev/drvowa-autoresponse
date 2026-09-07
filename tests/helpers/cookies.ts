const cookieJar = new Map<string, string>();

export function getCookieJar(): Map<string, string> {
  return cookieJar;
}

export function clearTestCookies(): void {
  cookieJar.clear();
}

export function setTestCookie(name: string, value: string): void {
  cookieJar.set(name, value);
}
