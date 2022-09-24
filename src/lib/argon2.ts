import Argon2WasmBytes from './argon2.wasm.ts';

function toBytes(str: string): Uint8Array {
	const codeUnits = Uint16Array.from(
		{ length: str.length },
		(_element, index) => str.charCodeAt(index),
	);
	return new Uint8Array(codeUnits.buffer);
}

function fromBytes(bytes: Uint8Array): string {
	const charCodes = new Uint16Array(bytes.buffer);
	let result = '';
	charCodes.forEach((char) => {
		result += String.fromCharCode(char);
	});
	return result;
}

function toBase64(bytes: Uint8Array): string {
	let result = '';
	bytes.forEach((char) => {
		result += String.fromCharCode(char);
	});
	return btoa(result);
}

function fromBase64(str: string): Uint8Array {
	const intermediateValue = atob(str);
	// We can use Uint8Array here because
	// the characters from atob() will all be ASCII (8 bits wide)
	return Uint8Array.from(
		{ length: intermediateValue.length },
		(_element, index) => intermediateValue.charCodeAt(index),
	);
}

interface Argon2Options {
	// No less than 8, no greater than 0xFFFFFFFF
	saltLength: number;
	// No less than 4, no greater than 0xFFFFFFFF
	outputLength: number;
}

class Argon2 {
	static async initialize(options: Argon2Options) {
		if (options.saltLength < 8) {
			throw new Error('Salt length cannot be less than 8 bytes');
		}
		if (options.saltLength > 0xFFFFFFFF) {
			throw new Error(
				'Salt length cannot be greater than 4294967295 bytes',
			);
		}
		if (options.outputLength < 4) {
			throw new Error('Output length cannot be less than 4 bytes');
		}
		if (options.outputLength > 0xFFFFFFFF) {
			throw new Error(
				'Output length cannot be greater than 4294967295 bytes',
			);
		}
		let wasmMemory = new WebAssembly.Memory({
			initial: 1,
			maximum: 2 ** 16,
		});
		const wasmImports = {
			js: {
				mem: wasmMemory,
			},
		};
		const wasmModule = await WebAssembly.instantiate(
			Argon2WasmBytes,
			wasmImports,
		);

		const wasmExports = wasmModule.instance.exports;
		// @ts-ignore
		wasmMemory = wasmModule.instance.exports.memory;
		// @ts-ignore
		const instancePtr = wasmExports.alloc_default_argon2();

		return new Argon2(
			wasmExports,
			wasmMemory,
			instancePtr,
			options,
		);
	}

	private constructor(
		wasmExports: any,
		wasmMemory: any,
		argon2InstancePtr: any,
		options: Argon2Options,
	) {
		// @ts-ignore
		this._wasmExports = wasmExports;
		// @ts-ignore
		this._wasmMemory = wasmMemory;
		// @ts-ignore
		this._instancePtr = argon2InstancePtr;
		// @ts-ignore
		this._options = options;
	}

	hash(password: string, saltB64?: string): [string, string] {
		const passwordBytes = toBytes(password);
		if (passwordBytes.length > 0xFFFFFFFF) {
			throw new Error(
				'Password length cannot be greater than 4294967295 bytes',
			);
		}
		// @ts-ignore
		const passwordPtr = this._wasmExports.alloc_bytes(passwordBytes.length);
		// Put passwordBytes in passwordPtr
		const passwordWriter = new Uint8Array(
			// @ts-ignore
			this._wasmMemory.buffer,
			passwordPtr,
			passwordBytes.length,
		);
		passwordWriter.set(passwordBytes);

		// @ts-ignore
		const saltPtr = this._wasmExports.alloc_bytes(this._options.saltLength);
		// @ts-ignore
		const saltWriter = new Uint8Array(
			// @ts-ignore
			this._wasmMemory.buffer,
			saltPtr,
			// @ts-ignore
			this._options.saltLength,
		);
		if (!!saltB64) {
			const saltBytes = fromBase64(saltB64);
			// @ts-ignore
			if (saltBytes.length !== this._options.saltLength) {
				throw new Error(
					// @ts-ignore
					`Invalid salt provided. Initialized length was ${this._options.saltLength}, found ${saltBytes.length}`,
				);
			}
			saltWriter.set(saltBytes);
		} else {
			crypto.getRandomValues(saltWriter);
			// Copy the salt bytes for returning before they get freed
			saltB64 = toBase64(saltWriter.slice(0));
		}

		// @ts-ignore
		const digestPtr = this._wasmExports.hash_password(
			// @ts-ignore
			this._instancePtr,
			passwordPtr,
			passwordBytes.length,
			saltPtr,
			// @ts-ignore
			this._options.saltLength,
			// @ts-ignore
			this._options.outputLength,
		);

		// Copy the output bytes from WASM memory to JS memory
		// then free / dealloc from WASM memory
		const outputBytes = new Uint8Array(
			// @ts-ignore
			this._wasmMemory.buffer,
			digestPtr,
			// @ts-ignore
			this._options.outputLength,
		);
		// @ts-ignore
		this._wasmExports.free_bytes(digestPtr, this._options.outputLength);

		return [toBase64(outputBytes), saltB64];
	}

	verify(
		password: string,
		saltB64: string,
		existingB64Digest: string,
	): boolean {
		return this.hash(password, saltB64)[0] === existingB64Digest;
	}
}

export type { Argon2Options };
export { Argon2, fromBase64, fromBytes, toBase64, toBytes };
