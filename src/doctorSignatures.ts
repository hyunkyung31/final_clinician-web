const signatures = import.meta.glob<string>(
  './assets/doctor_sign/*_signature.png',
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
);

export function getDoctorSignature(username?: string): string | undefined {
  if (!username) return undefined;

  return signatures[
    `./assets/doctor_sign/${username}_signature.png`
  ];
}