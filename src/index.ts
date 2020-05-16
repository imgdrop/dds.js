function getFourCCName(fourcc: number): string {
   const codes = new Uint8Array(new Uint32Array(fourcc).buffer);
   return String.fromCharCode(...Array.from(codes));
}

function getColorShades(color0: number, color1: number): number[] {
   return [color0, color1, (2 * color0 + color1) / 3, (color0 + 2 * color1) / 3];
}

function decodeBC1(chunk: Uint8Array, block: Uint8Array): void {
   const color0 = chunk[0] | (chunk[1] << 8);
   const color1 = chunk[2] | (chunk[3] << 8);
   const red = getColorShades(
      ((color0 >>> 11) * 0xff) / 0x1f,
      ((color1 >>> 11) * 0xff) / 0x1f
   );
   const green = getColorShades(
      (((color0 >>> 5) & 0x3f) * 0xff) / 0x3f,
      (((color1 >>> 5) & 0x3f) * 0xff) / 0x3f
   );
   const blue = getColorShades(
      ((color0 & 0x1f) * 0xff) / 0x1f,
      ((color1 & 0x1f) * 0xff) / 0x1f
   );

   const setValue = (index: number, byte: number, shift: number): void => {
      const bits = (chunk[byte] >>> shift) & 0x3;
      block[index * 4 + 0] = red[bits];
      block[index * 4 + 1] = green[bits];
      block[index * 4 + 2] = blue[bits];
   };
   setValue(0, 4, 0);
   setValue(1, 4, 2);
   setValue(2, 4, 4);
   setValue(3, 4, 6);
   setValue(4, 5, 0);
   setValue(5, 5, 2);
   setValue(6, 5, 4);
   setValue(7, 5, 6);
   setValue(8, 6, 0);
   setValue(9, 6, 2);
   setValue(10, 6, 4);
   setValue(11, 6, 6);
   setValue(12, 7, 0);
   setValue(13, 7, 2);
   setValue(14, 7, 4);
   setValue(15, 7, 6);
}

function decodeBC4(chunk: Uint8Array, block: Uint8Array): void {
   const alpha0 = chunk[0];
   const alpha1 = chunk[1];
   const alpha = [
      alpha0,
      alpha1,
      (6 * alpha0 + alpha1) / 7,
      (5 * alpha0 + 2 * alpha1) / 7,
      (4 * alpha0 + 3 * alpha1) / 7,
      (3 * alpha0 + 4 * alpha1) / 7,
      (2 * alpha0 + 5 * alpha1) / 7,
      (alpha0 + 6 * alpha1) / 7,
   ];

   const setValue = (index: number, byte: number, shift: number): void => {
      let bits = (chunk[byte] >>> shift) & 0x7;
      if (shift === 6) {
         bits |= (chunk[byte + 1] & 0x1) << 2;
      } else if (shift === 7) {
         bits |= (chunk[byte + 1] & 0x3) << 1;
      }
      block[index * 4 + 3] = alpha[bits];
   };
   setValue(0, 2, 0);
   setValue(1, 2, 3);
   setValue(2, 2, 6);
   setValue(3, 3, 1);
   setValue(4, 3, 4);
   setValue(5, 3, 7);
   setValue(6, 4, 2);
   setValue(7, 4, 5);
   setValue(8, 5, 0);
   setValue(9, 5, 3);
   setValue(10, 5, 6);
   setValue(11, 6, 1);
   setValue(12, 6, 4);
   setValue(13, 6, 7);
   setValue(14, 7, 2);
   setValue(15, 7, 5);
}

function unmultiplyAlpha(block: Uint8Array): void {
   for (let i = 0; i < 64; i += 4) {
      const alpha = block[i + 3] / 0xff;
      if (alpha !== 0) {
         block[i + 0] = Math.min(block[i + 0] / alpha, 0xff);
         block[i + 1] = Math.min(block[i + 1] / alpha, 0xff);
         block[i + 2] = Math.min(block[i + 2] / alpha, 0xff);
      }
   }
}

export class DDSDecoder {
   private buffer?: Uint8Array;

   public data = new Uint8Array(0);

   public width = 0;

   public height = 0;

   private get blockCount(): number {
      return Math.ceil(this.width / 4) * Math.ceil(this.height / 4);
   }

   constructor(private reader: (size: number) => ArrayBuffer) {}

   private readUint8(size: number): Uint8Array {
      if (this.buffer === undefined) {
         this.buffer = new Uint8Array(this.reader(Math.max(size, 65536)));
         if (this.buffer.length < size) {
            throw new Error('Not enough data');
         }
      }
      if (this.buffer.length >= size) {
         const output = this.buffer.subarray(0, size);
         this.buffer = this.buffer.subarray(size);
         return output;
      }

      const output = new Uint8Array(size);
      output.set(this.buffer);
      const bufferLength = this.buffer.length;
      this.buffer = undefined;
      output.set(this.readUint8(size - bufferLength), bufferLength);
      return output;
   }

   private readInt32(size: number): Int32Array {
      const output = this.readUint8(size << 2);
      return new Int32Array(output.buffer, output.byteOffset, size);
   }

   private decodeChunks(getBlock: (index: number, block: Uint8Array) => void): void {
      const block = new Uint8Array(64);
      let index = 0;
      for (let y = 0; y < this.height; y += 4) {
         for (let x = 0; x < this.width; x += 4) {
            getBlock(index, block);
            for (let by = 0; by < 4; by += 1) {
               for (let bx = 0; bx < 4; bx += 1) {
                  const bi = (by * 4 + bx) * 4;
                  const xx = Math.min(x + bx, this.width - 1);
                  const yy = Math.min(y + by, this.height - 1);
                  const i = (yy * this.width + xx) * 4;
                  this.data.set(block.subarray(bi, bi + 4), i);
               }
            }
            index += 1;
         }
      }
   }

   private decodeDXT1(): void {
      const blockSize = 8;
      const chunks = this.readUint8(this.blockCount * blockSize);
      this.decodeChunks((index, block) => {
         decodeBC1(chunks.subarray(index * blockSize), block);
         for (let i = 3; i < block.byteLength; i += 4) {
            block[i] = 0xff;
         }
      });
   }

   private decodeDXT3(unmultiply: boolean): void {
      const blockSize = 16;
      const chunks = this.readUint8(this.blockCount * blockSize);
      this.decodeChunks((index, block) => {
         for (let i = 0; i < 8; i += 1) {
            const alpha = chunks[index * blockSize + i];
            block[i * 8 + 3] = (alpha & 0xf) * 17;
            block[i * 8 + 7] = (alpha >>> 4) * 17;
         }
         decodeBC1(chunks.subarray(index * blockSize + 8), block);
         if (unmultiply) {
            unmultiplyAlpha(block);
         }
      });
   }

   private decodeDXT5(unmultiply: boolean): void {
      const blockSize = 16;
      const chunks = this.readUint8(this.blockCount * blockSize);
      this.decodeChunks((index, block) => {
         decodeBC4(chunks.subarray(index * blockSize), block);
         decodeBC1(chunks.subarray(index * blockSize + 8), block);
         if (unmultiply) {
            unmultiplyAlpha(block);
         }
      });
   }

   decode(): void {
      const magic = this.readInt32(1);
      if (magic[0] !== 0x20534444) {
         throw new Error('Invalid DDS magic');
      }
      const header = this.readInt32(31);
      if (header[0] !== 124) {
         throw new Error('Invalid header size');
      }

      this.height = header[2];
      this.width = header[3];
      this.data = new Uint8Array(this.width * this.height * 4);

      if (header[18] !== 32) {
         throw new Error('Invalid pixel format size');
      }
      const flags = header[19];
      if (!(flags & 0x4)) {
         throw new Error('Uncompressed pixel formats currently unsupported');
      }

      const fourcc = header[20];
      switch (fourcc) {
         case 0x31545844: // DXT1
            this.decodeDXT1();
            return;
         case 0x32545844: // DXT2
            this.decodeDXT3(true);
            break;
         case 0x33545844: // DXT3
            this.decodeDXT3(false);
            break;
         case 0x34545844: // DXT4
            this.decodeDXT5(true);
            break;
         case 0x35545844: // DXT5
            this.decodeDXT5(false);
            break;
         default:
            throw new Error(`Unknown FourCC: ${getFourCCName(fourcc)}`);
      }
   }
}
