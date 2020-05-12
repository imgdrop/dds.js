#include <stdlib.h>
#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <ctype.h>
#include <errno.h>

#define STB_DXT_IMPLEMENTATION
#include "stb/stb_dxt.h"

#define STB_IMAGE_IMPLEMENTATION
#define STBI_FAILURE_USERMSG
#include "stb/stb_image.h"

#define HELP_USAGE "usage: dds-enc <input> (dxt1|dxt2|dxt3|dxt4|dxt5) <output>"
#define MATH_MIN(x, y) ((x) < (y) ? (x) : (y))
#define DXT_FLAGS (STB_DXT_DITHER | STB_DXT_HIGHQUAL)

typedef enum DDSFormat {
   FORMAT_DXT1,
   FORMAT_DXT2,
   FORMAT_DXT3,
   FORMAT_DXT4,
   FORMAT_DXT5
} DDSFormat;

static char* stringUppercase(char* str) {
   for (char* c = str; *c != '\0'; ++c) {
      *c = toupper(*c);
   }
   return str;
}

static void fileWriteString(FILE* file, const char* str) {
   fwrite(str, strlen(str), 1, file);
}

static void fileWrite32(FILE* file, int32_t value) {
   fwrite(&value, 4, 1, file);
}

static void fileWritePadding(FILE* file, int size) {
   int32_t padding[size];
   memset(padding, 0, size * 4);
   fwrite(padding, 4, size, file);
}

int main(int argc, char* argv[]) {
   if (argc == 2) {
      char* arg = stringUppercase(argv[1]);
      if (strcmp(arg, "-H") == 0 || strcmp(arg, "--HELP") == 0) {
         puts(HELP_USAGE);
         return 0;
      }
   }
   if (argc != 4) {
      fputs(HELP_USAGE "\n", stderr);
      return 1;
   }

   int width, height, _;
   uint8_t* input = stbi_load(argv[1], &width, &height, &_, 4);
   if (input == NULL) {
      fprintf(stderr, "Failed to load %s: %s", argv[1], stbi_failure_reason());
      return 1;
   }

   char* fourcc = stringUppercase(argv[2]);
   DDSFormat format;
   if (strcmp(fourcc, "DXT1") == 0) {
      format = FORMAT_DXT1;
   } else if (strcmp(fourcc, "DXT2") == 0) {
      format = FORMAT_DXT2;
   } else if (strcmp(fourcc, "DXT3") == 0) {
      format = FORMAT_DXT3;
   } else if (strcmp(fourcc, "DXT4") == 0) {
      format = FORMAT_DXT4;
   } else if (strcmp(fourcc, "DXT5") == 0) {
      format = FORMAT_DXT5;
   } else {
      free(input);
      fprintf(stderr, "Unknown format: %s", fourcc);
   }

   FILE* output = fopen(argv[3], "wb");
   if (output == NULL) {
      free(input);
      fprintf(stderr, "Failed to open %s: %s", argv[3], strerror(errno));
      return 1;
   }

   fileWriteString(output, "DDS ");
   fileWrite32(output, 124);
   fileWrite32(output, 0x1007);
   fileWrite32(output, height);
   fileWrite32(output, width);
   fileWritePadding(output, 14);
   fileWrite32(output, 32);
   fileWrite32(output, 0x04);
   fileWriteString(output, fourcc);
   fileWritePadding(output, 5);
   fileWrite32(output, 0x1000);
   fileWritePadding(output, 4);

   for (int y = 0; y < height; y += 4) {
      for (int x = 0; x < width; x += 4) {
         uint8_t block[64];
         uint8_t alpha[16];
         for (int by = 0; by < 4; ++by) {
            for (int bx = 0; bx < 4; ++bx) {
               int ai = (by * 4) + bx;
               int bi = ai * 4;
               int xx = MATH_MIN(x + bx, width - 1);
               int yy = MATH_MIN(y + by, height - 1);
               int i = ((yy * width) + xx) * 4;
               block[bi + 0] = input[i + 0];
               block[bi + 1] = input[i + 1];
               block[bi + 2] = input[i + 2];
               block[bi + 3] = 0xFF;
               alpha[ai] = input[i + 3];
            }
         }

         uint8_t chunk[16];
         int chunkSize = 16;
         switch (format) {
            case FORMAT_DXT1:
               stb_compress_dxt_block(chunk, block, false, DXT_FLAGS);
               chunkSize = 8;
               break;
            case FORMAT_DXT2:
            case FORMAT_DXT3:
               for (int i = 0; i < 8; ++i) {
                  uint8_t a0 = alpha[i * 2 + 0] / 17;
                  uint8_t a1 = alpha[i * 2 + 1] / 17;
                  chunk[i] = (a1 << 4) | a0;
               }
               stb_compress_dxt_block(chunk + 8, block, false, DXT_FLAGS);
               break;
            case FORMAT_DXT4:
            case FORMAT_DXT5:
               stb_compress_bc4_block(chunk, alpha);
               stb_compress_dxt_block(chunk + 8, block, false, DXT_FLAGS);
               break;
         }
         fwrite(chunk, chunkSize, 1, output);
      }
   }

   fclose(output);
   free(input);
   return 0;
}
