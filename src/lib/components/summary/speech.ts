/**
 * Saying the word out loud.
 *
 * Every reference app puts audio on the word itself — Pleco has a speaker on each headword,
 * Du Chinese reads the sentence — and a review card with no way to hear the syllable is half a
 * flashcard. The platform already ships a Mandarin voice on every device this app targets
 * (macOS/iOS Tingting, Android and Windows zh-CN), so this needs no network, no audio assets
 * and no licence: it asks the OS.
 *
 * Everything here is defensive on purpose. `speechSynthesis` exists in every modern browser but
 * a given machine may carry no Chinese voice at all, and a headless one carries no voices
 * whatsoever, so the control is offered whenever the API is present and simply does nothing on a
 * machine with no voice rather than showing an error the learner cannot act on.
 */

/** Whether this browser can be asked to speak. False on the server, always. */
export function canSpeak(): boolean {
	return (
		typeof window !== 'undefined' &&
		'speechSynthesis' in window &&
		typeof window.SpeechSynthesisUtterance === 'function'
	);
}

/**
 * The best Mandarin voice installed, or `null`. Voices load asynchronously in Chrome, so this
 * is read at click time rather than cached — by the time a learner reaches this screen the list
 * is populated, and an empty list simply means the utterance falls back to the browser default.
 */
function mandarinVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
	const voices = synth.getVoices();
	const zh = voices.filter((voice) => voice.lang.replace('_', '-').toLowerCase().startsWith('zh'));
	if (zh.length === 0) return null;
	// zh-CN before zh-TW/zh-HK: this app teaches simplified Mandarin, and a Cantonese voice
	// reading 干什么 is worse than no audio.
	return zh.find((voice) => voice.lang.replace('_', '-').toLowerCase() === 'zh-cn') ?? zh[0];
}

/**
 * Speak one word. Returns whether the request was handed to the browser — not whether anything
 * was audible, which nothing can know.
 *
 * A little slower than default: these are single words being studied, and 0.85 is the
 * difference between hearing the tone contour and hearing a syllable go past.
 */
export function speak(text: string): boolean {
	if (!canSpeak() || text.trim() === '') return false;
	const synth = window.speechSynthesis;
	try {
		// A second tap replaces the first rather than queueing ten words behind it.
		synth.cancel();
		const utterance = new SpeechSynthesisUtterance(text);
		utterance.lang = 'zh-CN';
		utterance.rate = 0.85;
		// Voice selection is a preference, never a precondition: if picking one fails for any
		// reason the utterance still goes out on `lang`, which is what a browser with a single
		// bundled voice needs anyway.
		try {
			const voice = mandarinVoice(synth);
			if (voice) utterance.voice = voice;
		} catch {
			/* keep the default voice */
		}
		synth.speak(utterance);
		return true;
	} catch {
		return false;
	}
}
