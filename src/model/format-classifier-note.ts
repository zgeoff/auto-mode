export function formatClassifierNote(note: string, apiKey: string | null): string {
  return apiKey === null || apiKey === '' ? note : note.split(apiKey).join('[redacted]');
}
