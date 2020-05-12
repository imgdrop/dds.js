#define STB_DXT_IMPLEMENTATION
#include "stb_dxt.h"
#include <stdlib.h>
#include <stdio.h>
#include <stdbool.h>
#include <string.h>
#include <ctype.h>

#define MAIN_USAGE "usage: dds-enc <input.png> (dxt1|dxt2|dxt3|dxt4|dxt5) <output.dds>"

static char* stringUppercase(char* str) {
   for (char* c = str; *c != '\0'; ++c) {
      *c = toupper(*c);
   }
   return str;
}

int main(int argc, char* argv[]) {
   if (argc == 2) {
      char* arg = stringUppercase(argv[0]);
      if (strcmp(arg, "-h") == 0 || strcmp(arg, "--help") == 0) {
         puts(MAIN_USAGE);
         return 0;
      }
   }

   if (argc != 4) {
      fputs(MAIN_USAGE "\n", stderr);
      return 1;
   }
   return 0;
}
