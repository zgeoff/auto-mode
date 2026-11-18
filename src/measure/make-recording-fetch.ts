type SendFetch = (url: string, init: Readonly<RequestInit>) => Promise<Response>;

export type ResponseCopy = ReturnType<Response['clone']>;

export interface RecordingFetchOptions {
  readonly redirect: 'error' | 'manual';
  readonly responses: ResponseCopy[];
  readonly onSend?: () => void;
}

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
