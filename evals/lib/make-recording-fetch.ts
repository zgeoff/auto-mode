type SendFetch = (url: string, init: Readonly<RequestInit>) => Promise<Response>;

export type ResponseCopy = ReturnType<Response['clone']>;

export interface RecordingFetchOptions {
  readonly redirect: 'error' | 'manual';
  readonly responses: ResponseCopy[];
  readonly onSend?: () => void;
}

// A runner hands this to sendDecision: each attempt is reported before it goes
// out, a redirect is never followed into a second request, and a copy of each
// response stays readable after the client has consumed the original.
export function makeRecordingFetch(
  sendFetch: SendFetch,

  options: Readonly<RecordingFetchOptions>,
): SendFetch {
  return async (url, init) => {
    options.onSend?.();

    const response = await sendFetch(url, { ...init, redirect: options.redirect });

    options.responses.push(response.clone());

    return response;
  };
}
