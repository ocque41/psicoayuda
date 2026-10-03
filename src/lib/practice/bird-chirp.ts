/** Canto breve generado en el dispositivo. Solo se llama tras activar el sonido. */
export async function playBirdChirp(): Promise<boolean> {
  if (typeof window === "undefined" || !window.AudioContext) return false;
  let context: AudioContext;
  try {
    context = new window.AudioContext();
  } catch {
    return false;
  }
  try {
    await context.resume();
    if (context.state !== "running") {
      await context.close();
      return false;
    }
    const origin = context.currentTime + 0.02;
    for (let index = 0; index < 3; index++) {
      const start = origin + index * 0.25;
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(2300 + index * 170, start);
      oscillator.frequency.exponentialRampToValueAtTime(4300, start + 0.07);
      oscillator.frequency.exponentialRampToValueAtTime(2600, start + 0.17);
      volume.gain.setValueAtTime(0.0001, start);
      volume.gain.exponentialRampToValueAtTime(0.035, start + 0.015);
      volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      oscillator.connect(volume);
      volume.connect(context.destination);
      if (index === 2)
        oscillator.onended = () => {
          void context.close().catch(() => {});
        };
      oscillator.start(start);
      oscillator.stop(start + 0.2);
    }
    return true;
  } catch {
    await context.close().catch(() => {});
    return false;
  }
}
