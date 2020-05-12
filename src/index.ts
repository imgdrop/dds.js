function getFourCCName(fourcc: number): string {
   const codes = new Uint8Array(new Uint32Array(fourcc).buffer);
   return String.fromCharCode(...Array.from(codes));
}

function applyMask(value: number, mask: number): number {
   if (mask === 0) {
      return 0;
   }

   let m = mask;
   let v = value & m;
   for (; !(m & 1); m >>>= 1) {
      v >>>= 1;
   }
   let d = 1;
   for (; m & 1; m >>>= 1) {
      d <<= 1;
   }
   return (v * 0xff) / (d - 1);
}

export class DDSDecoder {
   private buffer?: Uint8Array;

   public data = new Uint8Array(0);

   public width = 0;

   public height = 0;

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
      return new Int32Array(output, output.byteOffset, size);
   }

   private decodeRaw(header: Int32Array): void {
      const bitCount = header[21];
      const rmask = header[22];
      const gmask = header[23];
      const bmask = header[24];
      let amask = 0;
      if (header[19] & 0x1) {
         amask = header[25];
      }

      const stride = Math.ceil((this.width * bitCount) / 8);
      let padding = 0;
      if (header[1] & 0x8) {
         padding = header[4] - stride;
      }

      for (let y = 0; y < this.height; y += 1) {
         if (y > 0 && padding > 0) {
            this.readUint8(padding);
         }

         let buffer = this.readInt32(1)[0];
         let bits = 32;
         for (let x = 0; x < this.width; x += 1) {
            let value = buffer;
            if (bits < bitCount) {
               buffer = this.readInt32(1)[0];
               value |= buffer << bits;
               buffer >>>= bitCount - bits;
               bits += 32 - bitCount;
            } else {
               buffer >>>= bitCount;
               bits -= bitCount;
            }

            const index = (y * this.width + x) * 4;
            this.data[index + 0] = applyMask(value, rmask);
            this.data[index + 1] = applyMask(value, gmask);
            this.data[index + 2] = applyMask(value, bmask);
            if (amask === 0) {
               this.data[index + 3] = 0xff;
            } else {
               this.data[index + 3] = applyMask(value, amask);
            }
         }
      }
   }

   decode(): void {
      const magic = this.readInt32(1);
      if (magic[0] !== 0x20534444) {
         throw new Error('Invalid DDS magic');
      }
      const header = this.readInt32(124);
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
         case 0x32545844: // DXT2
         case 0x33545844: // DXT3
         case 0x34545844: // DXT4
         case 0x35545844: // DXT5
         default:
            throw new Error(`Unknown FourCC: ${getFourCCName(fourcc)}`);
      }
   }
}
