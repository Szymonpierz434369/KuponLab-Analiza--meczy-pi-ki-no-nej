import { cookies } from 'next/headers';
import { LANG_COOKIE, makeT, parseLang, type Lang } from './i18n';

/** Język z ciasteczka (strony renderowane na serwerze). */
export async function getLang(): Promise<Lang> {
  return parseLang((await cookies()).get(LANG_COOKIE)?.value);
}

export async function getT() {
  return makeT(await getLang());
}
