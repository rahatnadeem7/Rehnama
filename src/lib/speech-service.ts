"use client";

export type SpeechResultCallback = (text: string, isFinal: boolean) => void;

export class SpeechService {
    private recognition: any;
    private isListening: boolean = false;

    constructor(onResult: SpeechResultCallback) {
        if (typeof window !== "undefined") {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

            if (SpeechRecognition) {
                this.recognition = new SpeechRecognition();
                this.recognition.continuous = true;
                this.recognition.interimResults = true;
                this.recognition.lang = "ar-SA"; // Arabic Saudi Arabia

                this.recognition.onresult = (event: any) => {
                    let interimTranscript = "";
                    let finalTranscript = "";

                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        if (event.results[i].isFinal) {
                            finalTranscript += event.results[i][0].transcript;
                        } else {
                            interimTranscript += event.results[i][0].transcript;
                        }
                    }

                    if (finalTranscript) {
                        onResult(finalTranscript, true);
                    } else if (interimTranscript) {
                        onResult(interimTranscript, false);
                    }
                };

                this.recognition.onerror = (event: any) => {
                    console.error("Speech Recognition Error:", event.error);
                };

                this.recognition.onend = () => {
                    if (this.isListening) {
                        this.recognition.start();
                    }
                };
            }
        }
    }

    start() {
        if (this.recognition && !this.isListening) {
            this.recognition.start();
            this.isListening = true;
        }
    }

    stop() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
            this.isListening = false;
        }
    }
}
