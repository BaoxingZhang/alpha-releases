
/* WARNING: Removing unreachable block (ram,0x000100227c00) */
/* WARNING: Removing unreachable block (ram,0x000100226670) */
/* WARNING: Removing unreachable block (ram,0x000100226680) */
/* WARNING: Removing unreachable block (ram,0x000100226dd4) */
/* WARNING: Removing unreachable block (ram,0x00010022670c) */
/* WARNING: Removing unreachable block (ram,0x0001002263ec) */
/* WARNING: Removing unreachable block (ram,0x0001002263d0) */
/* WARNING: Removing unreachable block (ram,0x000100227bf8) */
/* WARNING: Removing unreachable block (ram,0x00010022639c) */
/* WARNING: Removing unreachable block (ram,0x0001002264a0) */
/* WARNING: Removing unreachable block (ram,0x0001002263a8) */
/* WARNING: Removing unreachable block (ram,0x000100226400) */
/* WARNING: Removing unreachable block (ram,0x000100226408) */
/* WARNING: Removing unreachable block (ram,0x000100226418) */
/* WARNING: Removing unreachable block (ram,0x000100226424) */
/* WARNING: Removing unreachable block (ram,0x000100226430) */
/* WARNING: Removing unreachable block (ram,0x00010022643c) */
/* WARNING: Removing unreachable block (ram,0x00010022644c) */
/* WARNING: Removing unreachable block (ram,0x000100226460) */
/* WARNING: Removing unreachable block (ram,0x000100226468) */
/* WARNING: Removing unreachable block (ram,0x00010022647c) */
/* WARNING: Removing unreachable block (ram,0x000100226644) */
/* WARNING: Removing unreachable block (ram,0x000100226650) */
/* WARNING: Removing unreachable block (ram,0x000100226694) */
/* WARNING: Removing unreachable block (ram,0x00010022669c) */
/* WARNING: Removing unreachable block (ram,0x0001002266ac) */
/* WARNING: Removing unreachable block (ram,0x0001002266b8) */
/* WARNING: Removing unreachable block (ram,0x0001002266c4) */
/* WARNING: Removing unreachable block (ram,0x0001002266d4) */
/* WARNING: Removing unreachable block (ram,0x0001002266e4) */
/* WARNING: Removing unreachable block (ram,0x0001002266f0) */
/* WARNING: Removing unreachable block (ram,0x0001002266f8) */
/* WARNING: Removing unreachable block (ram,0x00010022672c) */
/* WARNING: Removing unreachable block (ram,0x0001002268a8) */
/* WARNING: Removing unreachable block (ram,0x000100226ddc) */
/* WARNING: Removing unreachable block (ram,0x0001002267b8) */
/* WARNING: Removing unreachable block (ram,0x00010022679c) */
/* WARNING: Removing unreachable block (ram,0x000100227c08) */
/* WARNING: Removing unreachable block (ram,0x000100226760) */
/* WARNING: Removing unreachable block (ram,0x00010022684c) */
/* WARNING: Removing unreachable block (ram,0x000100226774) */
/* WARNING: Removing unreachable block (ram,0x0001002267cc) */
/* WARNING: Removing unreachable block (ram,0x0001002267d4) */
/* WARNING: Removing unreachable block (ram,0x0001002267e4) */
/* WARNING: Removing unreachable block (ram,0x0001002267f0) */
/* WARNING: Removing unreachable block (ram,0x0001002267fc) */
/* WARNING: Removing unreachable block (ram,0x00010022680c) */
/* WARNING: Removing unreachable block (ram,0x00010022681c) */
/* WARNING: Removing unreachable block (ram,0x000100226830) */
/* WARNING: Removing unreachable block (ram,0x000100226838) */

void FUN_100226248(void)

{
  wchar_t *pwVar1;
  byte bVar2;
  undefined1 uVar3;
  void *pvVar4;
  code *pcVar5;
  bool bVar6;
  int iVar7;
  undefined8 *puVar8;
  undefined8 *puVar9;
  ulong uVar10;
  char *pcVar11;
  wchar_t *pwVar12;
  wchar_t *pwVar13;
  void *pvVar14;
  char cVar15;
  wchar_t *pwVar16;
  ulong uVar17;
  wchar_t *pwVar18;
  undefined1 *puVar19;
  undefined1 *puVar20;
  ulong uVar21;
  size_t sVar22;
  long *plVar23;
  uint uVar24;
  ulong uVar25;
  long lVar26;
  undefined8 uVar27;
  undefined8 uVar28;
  undefined8 uVar29;
  undefined8 uVar30;
  undefined8 uVar31;
  undefined8 uVar32;
  undefined8 uVar33;
  undefined8 uVar34;
  short sVar35;
  short sVar36;
  short sVar37;
  short sVar38;
  undefined8 local_a0;
  ulong uStack_98;
  undefined8 local_90;
  undefined7 local_80;
  undefined4 uStack_79;
  undefined5 uStack_75;
  undefined8 uStack_70;
  long local_68;
  
  local_68 = *(long *)PTR____stack_chk_guard_1007c41d0;
  local_80 = 0x2d797469727563;
  uStack_79 = 0x74736f68;
  puVar8 = (undefined8 *)__Znwm(0x30);
  *puVar8 = 0x65732d6168706c61;
  puVar8[1] = CONCAT17((undefined1)uStack_79,local_80);
  *(undefined4 *)((long)puVar8 + 0xf) = uStack_79;
  *(undefined1 *)((long)puVar8 + 0x13) = 0x2f;
  *(undefined2 *)((long)puVar8 + 0x1c) = 0x3176;
  builtin_strncpy((char *)((long)puVar8 + 0x14),"desktop-",8);
  *(undefined1 *)((long)puVar8 + 0x1e) = 0;
  if ((puVar8[1] == 0x682d797469727563 && puVar8[2] == 0x6b7365642f74736f) &&
      *(long *)((long)puVar8 + 0x16) == 0x31762d706f746b73) {
    puVar9 = (undefined8 *)__Znwm(0x30);
    *puVar9 = 0x68706c612e6d6f63;
    puVar9[1] = 0x2e64726175672e61;
    *(undefined4 *)((long)puVar9 + 0x1f) = 0x74736f68;
    builtin_strncpy((char *)(puVar9 + 3),"curity-h",8);
    *(char (*) [8])(puVar9 + 2) = (char  [8])0x65732d6168706c61;
    *(undefined2 *)((long)puVar9 + 0x23) = 0x2e;
    local_80 = SUB87(puVar9,0);
    uStack_79._0_1_ = (undefined1)((ulong)puVar9 >> 0x38);
    uStack_70 = (undefined1 *)0x8000000000000030;
    uStack_79._1_3_ = 0x24;
    uStack_75 = 0;
    builtin_strncpy((char *)((long)puVar9 + 0x24),"desktop-",8);
    *(undefined2 *)((long)puVar9 + 0x2c) = 0x3176;
    if ((long)uStack_70 < 0) {
      uStack_79._1_3_ = 0x2e;
      uStack_75 = 0;
      *(undefined1 *)((long)puVar9 + 0x2e) = 0;
      plVar23 = (long *)CONCAT17((undefined1)uStack_79,local_80);
      lVar26 = CONCAT53(uStack_75,uStack_79._1_3_);
      cVar15 = uStack_70._7_1_;
      if ((char)uStack_70._7_1_ < '\0') goto LAB_100226508;
LAB_100226564:
      uStack_79 = 0;
      uStack_75 = 0;
      local_80 = 0;
      uStack_70 = (undefined1 *)0x0;
      if (-1 < cVar15) goto LAB_100226588;
      uStack_79 = 0;
      uStack_75 = 0;
      local_80 = 0;
      uStack_70 = (undefined1 *)0x0;
      bVar6 = true;
      __ZdlPv(plVar23);
      if (-1 < (long)uStack_70) goto LAB_10022655c;
LAB_10022657c:
      __ZdlPv(CONCAT17((undefined1)uStack_79,local_80));
      if (bVar6) goto LAB_100226588;
    }
    else {
      uStack_70._7_1_ = '.';
      *(undefined1 *)((long)puVar9 + 0x2e) = 0;
      plVar23 = (long *)CONCAT17((undefined1)uStack_79,local_80);
      lVar26 = CONCAT53(uStack_75,uStack_79._1_3_);
      cVar15 = uStack_70._7_1_;
      if (-1 < (char)uStack_70._7_1_) goto LAB_100226564;
LAB_100226508:
      cVar15 = uStack_70._7_1_;
      if (lVar26 != 0x2e) goto LAB_100226564;
      uStack_79 = 0;
      uStack_75 = 0;
      local_80 = 0;
      uStack_70 = (undefined1 *)0x0;
      bVar6 = ((((*plVar23 != 0x68706c612e6d6f63 || plVar23[1] != 0x2e64726175672e61) ||
                plVar23[2] != 0x65732d6168706c61) || plVar23[3] != 0x682d797469727563) ||
              plVar23[4] != 0x6b7365642e74736f) ||
              *(long *)((long)plVar23 + 0x26) != 0x31762d706f746b73;
      __ZdlPv(plVar23);
      if ((long)uStack_70 < 0) goto LAB_10022657c;
LAB_10022655c:
      if (bVar6) goto LAB_100226588;
    }
    pcVar11 = (char *)__Znwm(0x19);
    builtin_strncpy(pcVar11,"Software\\Alpha\\Runtime\\",0x18);
    pwVar12 = (wchar_t *)__Znwm(0x38);
    pwVar12[2] = L'\x706c415c';
    pwVar12[3] = L'\x525c6168';
    *(undefined8 *)pwVar12 = 0x6572617774666f53;
    builtin_strncpy((char *)((long)pwVar12 + 0xf),"Runtime\\",8);
    builtin_strncpy((char *)((long)pwVar12 + 0x26),"host",4);
    builtin_strncpy((char *)((long)pwVar12 + 0x1f),"curity-h",8);
    *(char (*) [8])((long)pwVar12 + 0x17) = (char  [8])0x65732d6168706c61;
    __ZdlPv(pcVar11);
    *(char *)((long)pwVar12 + 0x2a) = '\0';
    *(char *)((long)pwVar12 + 0x2a) = '\\';
    local_90 = puVar20;
    uStack_98 = uVar10;
    local_a0 = pwVar12;
    builtin_strncpy((char *)((long)pwVar12 + 0x2b),"desktop-",8);
    puVar19 = local_90;
    uVar21 = uStack_98;
    local_90 = (undefined1 *)0x8000000000000038;
    puVar20 = local_90;
    uStack_98 = 0x2b;
    uVar10 = uStack_98;
    uStack_98 = uVar21;
    local_90 = puVar19;
    ((char *)((long)pwVar12 + 0x33))[0] = 'v';
    ((char *)((long)pwVar12 + 0x33))[1] = '1';
    uVar21 = 0x35;
    if (-1 < (long)local_90) {
      local_90 = (undefined1 *)CONCAT17(0x35,(undefined7)local_90);
      uVar21 = uStack_98;
    }
    uStack_98 = uVar21;
    *(char *)((long)pwVar12 + 0x35) = '\0';
    puVar20 = local_90;
    uVar10 = uStack_98;
    pwVar12 = local_a0;
    uStack_79._1_3_ = (undefined3)uStack_98;
    uStack_75 = (undefined5)(uStack_98 >> 0x18);
    local_80 = SUB87(local_a0,0);
    uStack_79._0_1_ = (undefined1)((ulong)local_a0 >> 0x38);
    uStack_70 = local_90;
    local_90 = (undefined1 *)0x0;
    uStack_98 = 0;
    local_a0 = (wchar_t *)0x0;
    uStack_70._7_1_ = (byte)((ulong)puVar20 >> 0x38);
    uVar24 = (uint)(char)uStack_70._7_1_;
    if (-1 < (int)uVar24) {
      uVar10 = (ulong)uStack_70._7_1_;
      pwVar12 = (wchar_t *)&local_80;
    }
    uStack_70 = puVar20;
    if (0x3ffffffffffffff6 < uVar10) {
      FUN_100227f5c();
                    /* WARNING: Does not return */
      pcVar5 = (code *)SoftwareBreakpoint(1,0x100227c10);
      (*pcVar5)();
    }
    if (uVar10 < 5) {
      local_90 = (undefined1 *)(uVar10 << 0x38);
      pwVar13 = (wchar_t *)&local_a0;
      if (uVar10 != 0) goto LAB_100226920;
      pwVar16 = (wchar_t *)&local_a0;
    }
    else {
      uVar21 = 7;
      if ((uVar10 | 1) != 5) {
        uVar21 = (uVar10 | 1) + 1;
      }
      pwVar13 = (wchar_t *)__Znwm(uVar21 << 2);
      local_90 = (undefined1 *)(uVar21 | 0x8000000000000000);
      local_a0 = pwVar13;
      uStack_98 = uVar10;
LAB_100226920:
      pwVar1 = (wchar_t *)((long)pwVar12 + uVar10);
      if ((0x3f < uVar10) && ((pwVar1 <= pwVar13 || (pwVar13 + uVar10 <= pwVar12)))) {
        uVar17 = uVar10 & 0x3fffffffffffffc0;
        pwVar16 = pwVar13 + uVar17;
        pwVar13 = pwVar13 + 0x20;
        pwVar18 = pwVar12 + 8;
        uVar21 = uVar17;
        do {
          uVar28 = *(undefined8 *)(pwVar18 + -6);
          uVar27 = *(undefined8 *)(pwVar18 + -8);
          uVar30 = *(undefined8 *)(pwVar18 + -2);
          uVar29 = *(undefined8 *)(pwVar18 + -4);
          uVar32 = *(undefined8 *)(pwVar18 + 2);
          uVar31 = *(undefined8 *)pwVar18;
          uVar34 = *(undefined8 *)(pwVar18 + 6);
          uVar33 = *(undefined8 *)(pwVar18 + 4);
          sVar35 = (short)(char)((ulong)uVar27 >> 0x28);
          sVar36 = (short)(char)((ulong)uVar27 >> 0x38);
          sVar37 = (short)(char)((ulong)uVar29 >> 0x28);
          sVar38 = (short)(char)((ulong)uVar29 >> 0x38);
          *(ulong *)(pwVar13 + -0x16) =
               CONCAT44((int)(short)(char)((ulong)uVar28 >> 0x18),
                        (int)(short)(char)((ulong)uVar28 >> 0x10));
          *(ulong *)(pwVar13 + -0x18) =
               CONCAT44((int)(short)(char)((ulong)uVar28 >> 8),(int)(short)(char)uVar28);
          *(ulong *)(pwVar13 + -0x12) =
               CONCAT44((int)(short)(char)((ulong)uVar28 >> 0x38),
                        (int)(short)(char)((ulong)uVar28 >> 0x30));
          *(ulong *)(pwVar13 + -0x14) =
               CONCAT44((int)(short)(char)((ulong)uVar28 >> 0x28),
                        (int)(short)(char)((ulong)uVar28 >> 0x20));
          *(ulong *)(pwVar13 + -0x1e) =
               CONCAT44((int)(short)(char)((ulong)uVar27 >> 0x18),
                        (int)(short)(char)((ulong)uVar27 >> 0x10));
          *(ulong *)(pwVar13 + -0x20) =
               CONCAT44((int)(short)(char)((ulong)uVar27 >> 8),(int)(short)(char)uVar27);
          *(ulong *)(pwVar13 + -0x1a) =
               CONCAT26(sVar36 >> 0xf,CONCAT24(sVar36,(int)(short)(char)((ulong)uVar27 >> 0x30)));
          *(ulong *)(pwVar13 + -0x1c) =
               CONCAT26(sVar35 >> 0xf,CONCAT24(sVar35,(int)(short)(char)((ulong)uVar27 >> 0x20)));
          sVar35 = (short)(char)((ulong)uVar31 >> 0x28);
          sVar36 = (short)(char)((ulong)uVar31 >> 0x38);
          *(ulong *)(pwVar13 + -6) =
               CONCAT44((int)(short)(char)((ulong)uVar30 >> 0x18),
                        (int)(short)(char)((ulong)uVar30 >> 0x10));
          *(ulong *)(pwVar13 + -8) =
               CONCAT44((int)(short)(char)((ulong)uVar30 >> 8),(int)(short)(char)uVar30);
          *(ulong *)(pwVar13 + -2) =
               CONCAT44((int)(short)(char)((ulong)uVar30 >> 0x38),
                        (int)(short)(char)((ulong)uVar30 >> 0x30));
          *(ulong *)(pwVar13 + -4) =
               CONCAT44((int)(short)(char)((ulong)uVar30 >> 0x28),
                        (int)(short)(char)((ulong)uVar30 >> 0x20));
          *(ulong *)(pwVar13 + -0xe) =
               CONCAT44((int)(short)(char)((ulong)uVar29 >> 0x18),
                        (int)(short)(char)((ulong)uVar29 >> 0x10));
          *(ulong *)(pwVar13 + -0x10) =
               CONCAT44((int)(short)(char)((ulong)uVar29 >> 8),(int)(short)(char)uVar29);
          *(ulong *)(pwVar13 + -10) =
               CONCAT26(sVar38 >> 0xf,CONCAT24(sVar38,(int)(short)(char)((ulong)uVar29 >> 0x30)));
          *(ulong *)(pwVar13 + -0xc) =
               CONCAT26(sVar37 >> 0xf,CONCAT24(sVar37,(int)(short)(char)((ulong)uVar29 >> 0x20)));
          *(ulong *)(pwVar13 + 10) =
               CONCAT44((int)(short)(char)((ulong)uVar32 >> 0x18),
                        (int)(short)(char)((ulong)uVar32 >> 0x10));
          *(ulong *)(pwVar13 + 8) =
               CONCAT44((int)(short)(char)((ulong)uVar32 >> 8),(int)(short)(char)uVar32);
          *(ulong *)(pwVar13 + 0xe) =
               CONCAT44((int)(short)(char)((ulong)uVar32 >> 0x38),
                        (int)(short)(char)((ulong)uVar32 >> 0x30));
          *(ulong *)(pwVar13 + 0xc) =
               CONCAT44((int)(short)(char)((ulong)uVar32 >> 0x28),
                        (int)(short)(char)((ulong)uVar32 >> 0x20));
          *(ulong *)(pwVar13 + 2) =
               CONCAT44((int)(short)(char)((ulong)uVar31 >> 0x18),
                        (int)(short)(char)((ulong)uVar31 >> 0x10));
          *(ulong *)pwVar13 =
               CONCAT44((int)(short)(char)((ulong)uVar31 >> 8),(int)(short)(char)uVar31);
          *(ulong *)(pwVar13 + 6) =
               CONCAT26(sVar36 >> 0xf,CONCAT24(sVar36,(int)(short)(char)((ulong)uVar31 >> 0x30)));
          *(ulong *)(pwVar13 + 4) =
               CONCAT26(sVar35 >> 0xf,CONCAT24(sVar35,(int)(short)(char)((ulong)uVar31 >> 0x20)));
          *(ulong *)(pwVar13 + 0x1a) =
               CONCAT44((int)(short)(char)((ulong)uVar34 >> 0x18),
                        (int)(short)(char)((ulong)uVar34 >> 0x10));
          *(ulong *)(pwVar13 + 0x18) =
               CONCAT44((int)(short)(char)((ulong)uVar34 >> 8),(int)(short)(char)uVar34);
          *(ulong *)(pwVar13 + 0x1e) =
               CONCAT44((int)(short)(char)((ulong)uVar34 >> 0x38),
                        (int)(short)(char)((ulong)uVar34 >> 0x30));
          *(ulong *)(pwVar13 + 0x1c) =
               CONCAT44((int)(short)(char)((ulong)uVar34 >> 0x28),
                        (int)(short)(char)((ulong)uVar34 >> 0x20));
          *(ulong *)(pwVar13 + 0x12) =
               CONCAT44((int)(short)(char)((ulong)uVar33 >> 0x18),
                        (int)(short)(char)((ulong)uVar33 >> 0x10));
          *(ulong *)(pwVar13 + 0x10) =
               CONCAT44((int)(short)(char)((ulong)uVar33 >> 8),(int)(short)(char)uVar33);
          *(ulong *)(pwVar13 + 0x16) =
               CONCAT44((int)(short)(char)((ulong)uVar33 >> 0x38),
                        (int)(short)(char)((ulong)uVar33 >> 0x30));
          *(ulong *)(pwVar13 + 0x14) =
               CONCAT44((int)(short)(char)((ulong)uVar33 >> 0x28),
                        (int)(short)(char)((ulong)uVar33 >> 0x20));
          pwVar13 = pwVar13 + 0x40;
          uVar21 = uVar21 - 0x40;
          pwVar18 = pwVar18 + 0x10;
        } while (uVar21 != 0);
        pwVar13 = pwVar16;
        pwVar12 = (wchar_t *)((long)pwVar12 + uVar17);
        if (uVar10 == uVar17) goto LAB_100226958;
      }
      do {
        pwVar18 = (wchar_t *)((long)pwVar12 + 1);
        pwVar16 = pwVar13 + 1;
        *pwVar13 = (int)(char)*pwVar12;
        pwVar13 = pwVar16;
        pwVar12 = pwVar18;
      } while (pwVar18 != pwVar1);
    }
LAB_100226958:
    pwVar12 = local_a0;
    *pwVar16 = L'\0';
    if ((long)local_90 < 0) {
      if (uStack_98 != 0x35) {
        __ZdlPv(local_a0);
        goto LAB_100226cec;
      }
      iVar7 = _wmemcmp(local_a0,L"Software\\Alpha\\Runtime\\alpha-security-host\\desktop-v1",0x35);
      __ZdlPv(pwVar12);
      if (iVar7 != 0) goto LAB_100226cec;
      lVar26 = 0;
      local_a0 = (wchar_t *)0x0;
      uStack_98 = 0;
      local_90 = (undefined1 *)0x0;
LAB_1002269d8:
      do {
        bVar2 = (&DAT_100646018)[lVar26];
        cVar15 = "0"[bVar2 >> 4];
        if ((long)local_90 < 0) {
          uVar10 = ((ulong)local_90 & 0x7fffffffffffffff) - 1;
          sVar22 = uStack_98;
          if (uStack_98 == uVar10) {
            if (((ulong)local_90 & 0x7fffffffffffffff) == 0x7ffffffffffffff7) goto LAB_100227bf0;
            pwVar12 = local_a0;
            if (uVar10 < 0x3ffffffffffffff3) {
              uVar17 = uVar10 * 2 | 7;
              uVar21 = 0x19;
              if (uVar17 != 0x17) {
                uVar21 = uVar17 + 1;
              }
              uVar17 = 0x17;
              if (0xb < uVar10) {
                uVar17 = uVar21;
              }
              uVar21 = 0;
              if (uVar10 != 0) {
                uVar21 = uVar10;
              }
              uVar25 = 0x17;
              if (uVar10 != 0) {
                uVar25 = uVar17;
              }
              goto LAB_100226a7c;
            }
            bVar6 = false;
            uVar25 = 0x7ffffffffffffff7;
            goto LAB_100226a84;
          }
LAB_100226ae4:
          uStack_98 = sVar22 + 1;
          pwVar12 = local_a0;
        }
        else {
          if (local_90._7_1_ == 0x16) {
            uVar21 = 0x16;
            pwVar12 = (wchar_t *)&local_a0;
            uVar25 = 0x30;
LAB_100226a7c:
            bVar6 = uVar21 == 0x16;
            uVar10 = uVar21;
LAB_100226a84:
            pwVar13 = (wchar_t *)__Znwm(uVar25);
            if (uVar10 != 0) {
              _memmove(pwVar13,pwVar12,uVar10);
            }
            if (!bVar6) {
              __ZdlPv(pwVar12);
            }
            local_90 = (undefined1 *)(uVar25 | 0x8000000000000000);
            sVar22 = uVar10;
            local_a0 = pwVar13;
            goto LAB_100226ae4;
          }
          sVar22 = (size_t)local_90._7_1_;
          local_90 = (undefined1 *)
                     (CONCAT17(local_90._7_1_ + 1,(undefined7)local_90) & 0x7fffffffffffffff);
          pwVar12 = (wchar_t *)&local_a0;
        }
        *(char *)((long)pwVar12 + sVar22) = cVar15;
        ((char *)((long)pwVar12 + sVar22))[1] = '\0';
        cVar15 = "0"[(ulong)bVar2 & 0xf];
        if ((long)local_90 < 0) {
          sVar22 = ((ulong)local_90 & 0x7fffffffffffffff) - 1;
          if (uStack_98 == sVar22) {
            if (((ulong)local_90 & 0x7fffffffffffffff) == 0x7ffffffffffffff7) {
LAB_100227bf0:
                    /* WARNING: Subroutine does not return */
              FUN_100215a4c();
            }
            pwVar12 = local_a0;
            if (sVar22 < 0x3ffffffffffffff3) {
              if (sVar22 == 0) {
                uVar10 = 0x17;
              }
              else {
                uVar10 = sVar22 * 2 | 7;
                uVar21 = 0x19;
                if (uVar10 != 0x17) {
                  uVar21 = uVar10 + 1;
                }
                uVar10 = 0x17;
                if (0xb < sVar22) {
                  uVar10 = uVar21;
                }
              }
              goto LAB_100226b24;
            }
            bVar6 = false;
            uVar10 = 0x7ffffffffffffff7;
            goto LAB_100226b2c;
          }
LAB_100226bdc:
          uVar10 = uStack_98 + 1;
          *(char *)((long)local_a0 + uStack_98) = cVar15;
          ((char *)((long)local_a0 + uStack_98))[1] = '\0';
          lVar26 = lVar26 + 1;
          uStack_98 = uVar10;
          if (lVar26 == 0x20) break;
          goto LAB_1002269d8;
        }
        if (local_90._7_1_ == 0x16) {
          sVar22 = 0x16;
          pwVar12 = (wchar_t *)&local_a0;
          uVar10 = 0x30;
LAB_100226b24:
          bVar6 = sVar22 == 0x16;
LAB_100226b2c:
          pwVar13 = (wchar_t *)__Znwm(uVar10);
          if (sVar22 != 0) {
            _memmove(pwVar13,pwVar12,sVar22);
          }
          if (!bVar6) {
            __ZdlPv(pwVar12);
          }
          local_90 = (undefined1 *)(uVar10 | 0x8000000000000000);
          uStack_98 = sVar22;
          local_a0 = pwVar13;
          goto LAB_100226bdc;
        }
        uVar10 = (ulong)local_90._7_1_;
        local_90 = (undefined1 *)
                   (CONCAT17(local_90._7_1_ + 1,(undefined7)local_90) & 0x7fffffffffffffff);
        *(char *)((long)&local_a0 + uVar10) = cVar15;
        *(undefined1 *)((long)&local_a0 + uVar10 + 1) = 0;
        lVar26 = lVar26 + 1;
      } while (lVar26 != 0x20);
      if ((long)local_90 < 0) {
        if (uStack_98 == 0x40) {
          bVar6 = ((((((*(long *)local_a0 == 0x6563353033343731 &&
                       *(long *)(local_a0 + 2) == 0x6564373930373837) &&
                      *(long *)(local_a0 + 4) == 0x3762303534636263) &&
                     *(long *)(local_a0 + 6) == 0x3562376163653534) &&
                    *(long *)(local_a0 + 8) == 0x3734623065363632) &&
                   *(long *)(local_a0 + 10) == 0x3463373737623931) &&
                  *(long *)(local_a0 + 0xc) == 0x6537386665323464) &&
                  *(long *)(local_a0 + 0xe) == 0x3065616636316162;
        }
        else {
          bVar6 = false;
        }
        __ZdlPv();
        uVar24 = (uint)uStack_70._7_1_;
      }
      else {
        bVar6 = false;
        uVar24 = (uint)uStack_70._7_1_;
      }
    }
    else {
LAB_100226cec:
      bVar6 = false;
    }
    if ((uVar24 >> 7 & 1) == 0) {
      __ZdlPv(puVar8);
    }
    else {
      __ZdlPv(CONCAT17((undefined1)uStack_79,local_80));
      __ZdlPv(puVar8);
    }
    if (bVar6) {
      uVar10 = FUN_100225e9c("AlphaRuntimePolicy/Ed25519/v1",0x11fb,&DAT_100645ecb,0x40);
      if ((int)uVar10 == 0) goto LAB_100226594;
      local_80 = 0;
      uStack_79 = 0;
      uStack_75 = 0;
      uStack_70 = (undefined1 *)0x0;
      FUN_100228128(&local_80,0,"APOL-BIND-v1",&DAT_100645f1e,0xd);
      FUN_10021b3fc(&local_80,CONCAT53(uStack_75,uStack_79._1_3_),&DAT_100646018,&DAT_100646038,0x20
                   );
      puVar20 = (undefined1 *)CONCAT53(uStack_75,uStack_79._1_3_);
      if (puVar20 < uStack_70) {
        puVar19 = puVar20 + 1;
        *puVar20 = 0x8f;
      }
      else {
        pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
        sVar22 = (long)puVar20 - (long)pvVar4;
        uVar10 = sVar22 + 1;
        if ((long)uVar10 < 0) goto LAB_100227b24;
        uVar21 = ((long)uStack_70 - (long)pvVar4) * 2;
        if (uVar21 < uVar10 || uVar21 - uVar10 == 0) {
          uVar21 = uVar10;
        }
        if (0x3ffffffffffffffe < (ulong)((long)uStack_70 - (long)pvVar4)) {
          uVar21 = 0x7fffffffffffffff;
        }
        if (uVar21 == 0) {
          pvVar14 = (void *)0x0;
        }
        else {
          pvVar14 = (void *)__Znwm(uVar21);
        }
        puVar19 = (undefined1 *)((long)pvVar14 + sVar22) + 1;
        *(undefined1 *)((long)pvVar14 + sVar22) = 0x8f;
        _memcpy(pvVar14,pvVar4,sVar22);
        local_80 = SUB87(pvVar14,0);
        uStack_79._0_1_ = (undefined1)((ulong)pvVar14 >> 0x38);
        uStack_79._1_3_ = SUB83(puVar19,0);
        uStack_75 = (undefined5)((ulong)puVar19 >> 0x18);
        uStack_70 = (undefined1 *)((long)pvVar14 + uVar21);
        if (pvVar4 != (void *)0x0) {
          __ZdlPv(pvVar4);
        }
      }
      uStack_79._1_3_ = SUB83(puVar19,0);
      uStack_75 = (undefined5)((ulong)puVar19 >> 0x18);
      if (puVar19 < uStack_70) {
        puVar20 = puVar19 + 1;
        *puVar19 = 0xeb;
      }
      else {
        pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
        sVar22 = (long)puVar19 - (long)pvVar4;
        uVar10 = sVar22 + 1;
        if ((long)uVar10 < 0) goto LAB_100227b24;
        uVar21 = ((long)uStack_70 - (long)pvVar4) * 2;
        if (uVar21 < uVar10 || uVar21 - uVar10 == 0) {
          uVar21 = uVar10;
        }
        if (0x3ffffffffffffffe < (ulong)((long)uStack_70 - (long)pvVar4)) {
          uVar21 = 0x7fffffffffffffff;
        }
        if (uVar21 == 0) {
          pvVar14 = (void *)0x0;
        }
        else {
          pvVar14 = (void *)__Znwm(uVar21);
        }
        puVar20 = (undefined1 *)((long)pvVar14 + sVar22) + 1;
        *(undefined1 *)((long)pvVar14 + sVar22) = 0xeb;
        _memcpy(pvVar14,pvVar4,sVar22);
        local_80 = SUB87(pvVar14,0);
        uStack_79._0_1_ = (undefined1)((ulong)pvVar14 >> 0x38);
        uStack_79._1_3_ = SUB83(puVar20,0);
        uStack_75 = (undefined5)((ulong)puVar20 >> 0x18);
        uStack_70 = (undefined1 *)((long)pvVar14 + uVar21);
        if (pvVar4 != (void *)0x0) {
          __ZdlPv(pvVar4);
        }
      }
      uStack_79._1_3_ = SUB83(puVar20,0);
      uStack_75 = (undefined5)((ulong)puVar20 >> 0x18);
      if (puVar20 < uStack_70) {
        puVar19 = puVar20 + 1;
        *puVar20 = 0x51;
      }
      else {
        pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
        sVar22 = (long)puVar20 - (long)pvVar4;
        uVar10 = sVar22 + 1;
        if ((long)uVar10 < 0) goto LAB_100227b24;
        uVar21 = ((long)uStack_70 - (long)pvVar4) * 2;
        if (uVar21 < uVar10 || uVar21 - uVar10 == 0) {
          uVar21 = uVar10;
        }
        if (0x3ffffffffffffffe < (ulong)((long)uStack_70 - (long)pvVar4)) {
          uVar21 = 0x7fffffffffffffff;
        }
        if (uVar21 == 0) {
          pvVar14 = (void *)0x0;
        }
        else {
          pvVar14 = (void *)__Znwm(uVar21);
        }
        puVar19 = (undefined1 *)((long)pvVar14 + sVar22) + 1;
        *(undefined1 *)((long)pvVar14 + sVar22) = 0x51;
        _memcpy(pvVar14,pvVar4,sVar22);
        local_80 = SUB87(pvVar14,0);
        uStack_79._0_1_ = (undefined1)((ulong)pvVar14 >> 0x38);
        uStack_79._1_3_ = SUB83(puVar19,0);
        uStack_75 = (undefined5)((ulong)puVar19 >> 0x18);
        uStack_70 = (undefined1 *)((long)pvVar14 + uVar21);
        if (pvVar4 != (void *)0x0) {
          __ZdlPv(pvVar4);
        }
      }
      uStack_79._1_3_ = SUB83(puVar19,0);
      uStack_75 = (undefined5)((ulong)puVar19 >> 0x18);
      if (puVar19 < uStack_70) {
        puVar20 = puVar19 + 1;
        *puVar19 = 0xc3;
      }
      else {
        pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
        sVar22 = (long)puVar19 - (long)pvVar4;
        uVar10 = sVar22 + 1;
        if ((long)uVar10 < 0) goto LAB_100227b24;
        uVar21 = ((long)uStack_70 - (long)pvVar4) * 2;
        if (uVar21 < uVar10 || uVar21 - uVar10 == 0) {
          uVar21 = uVar10;
        }
        if (0x3ffffffffffffffe < (ulong)((long)uStack_70 - (long)pvVar4)) {
          uVar21 = 0x7fffffffffffffff;
        }
        if (uVar21 == 0) {
          pvVar14 = (void *)0x0;
        }
        else {
          pvVar14 = (void *)__Znwm(uVar21);
        }
        puVar20 = (undefined1 *)((long)pvVar14 + sVar22) + 1;
        *(undefined1 *)((long)pvVar14 + sVar22) = 0xc3;
        _memcpy(pvVar14,pvVar4,sVar22);
        local_80 = SUB87(pvVar14,0);
        uStack_79._0_1_ = (undefined1)((ulong)pvVar14 >> 0x38);
        uStack_79._1_3_ = SUB83(puVar20,0);
        uStack_75 = (undefined5)((ulong)puVar20 >> 0x18);
        uStack_70 = (undefined1 *)((long)pvVar14 + uVar21);
        if (pvVar4 != (void *)0x0) {
          __ZdlPv(pvVar4);
        }
      }
      uStack_79._1_3_ = SUB83(puVar20,0);
      uStack_75 = (undefined5)((ulong)puVar20 >> 0x18);
      if (puVar20 < uStack_70) {
        puVar19 = puVar20 + 1;
        *puVar20 = 0x6d;
      }
      else {
        pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
        sVar22 = (long)puVar20 - (long)pvVar4;
        uVar10 = sVar22 + 1;
        if ((long)uVar10 < 0) goto LAB_100227b24;
        uVar21 = ((long)uStack_70 - (long)pvVar4) * 2;
        if (uVar21 < uVar10 || uVar21 - uVar10 == 0) {
          uVar21 = uVar10;
        }
        if (0x3ffffffffffffffe < (ulong)((long)uStack_70 - (long)pvVar4)) {
          uVar21 = 0x7fffffffffffffff;
        }
        if (uVar21 == 0) {
          pvVar14 = (void *)0x0;
        }
        else {
          pvVar14 = (void *)__Znwm(uVar21);
        }
        puVar19 = (undefined1 *)((long)pvVar14 + sVar22) + 1;
        *(undefined1 *)((long)pvVar14 + sVar22) = 0x6d;
        _memcpy(pvVar14,pvVar4,sVar22);
        local_80 = SUB87(pvVar14,0);
        uStack_79._0_1_ = (undefined1)((ulong)pvVar14 >> 0x38);
        uStack_79._1_3_ = SUB83(puVar19,0);
        uStack_75 = (undefined5)((ulong)puVar19 >> 0x18);
        uStack_70 = (undefined1 *)((long)pvVar14 + uVar21);
        if (pvVar4 != (void *)0x0) {
          __ZdlPv(pvVar4);
        }
      }
      uStack_79._1_3_ = SUB83(puVar19,0);
      uStack_75 = (undefined5)((ulong)puVar19 >> 0x18);
      if (puVar19 < uStack_70) {
        puVar20 = puVar19 + 1;
        *puVar19 = 0xff;
      }
      else {
        pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
        sVar22 = (long)puVar19 - (long)pvVar4;
        uVar10 = sVar22 + 1;
        if ((long)uVar10 < 0) goto LAB_100227b24;
        uVar21 = ((long)uStack_70 - (long)pvVar4) * 2;
        if (uVar21 < uVar10 || uVar21 - uVar10 == 0) {
          uVar21 = uVar10;
        }
        if (0x3ffffffffffffffe < (ulong)((long)uStack_70 - (long)pvVar4)) {
          uVar21 = 0x7fffffffffffffff;
        }
        if (uVar21 == 0) {
          pvVar14 = (void *)0x0;
        }
        else {
          pvVar14 = (void *)__Znwm(uVar21);
        }
        puVar20 = (undefined1 *)((long)pvVar14 + sVar22) + 1;
        *(undefined1 *)((long)pvVar14 + sVar22) = 0xff;
        _memcpy(pvVar14,pvVar4,sVar22);
        local_80 = SUB87(pvVar14,0);
        uStack_79._0_1_ = (undefined1)((ulong)pvVar14 >> 0x38);
        uStack_79._1_3_ = SUB83(puVar20,0);
        uStack_75 = (undefined5)((ulong)puVar20 >> 0x18);
        uStack_70 = (undefined1 *)((long)pvVar14 + uVar21);
        if (pvVar4 != (void *)0x0) {
          __ZdlPv(pvVar4);
        }
      }
      uStack_79._1_3_ = SUB83(puVar20,0);
      uStack_75 = (undefined5)((ulong)puVar20 >> 0x18);
      if (puVar20 < uStack_70) {
        puVar19 = puVar20 + 1;
        *puVar20 = 0xf4;
      }
      else {
        pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
        sVar22 = (long)puVar20 - (long)pvVar4;
        uVar10 = sVar22 + 1;
        if ((long)uVar10 < 0) goto LAB_100227b24;
        uVar21 = ((long)uStack_70 - (long)pvVar4) * 2;
        if (uVar21 < uVar10 || uVar21 - uVar10 == 0) {
          uVar21 = uVar10;
        }
        if (0x3ffffffffffffffe < (ulong)((long)uStack_70 - (long)pvVar4)) {
          uVar21 = 0x7fffffffffffffff;
        }
        if (uVar21 == 0) {
          pvVar14 = (void *)0x0;
        }
        else {
          pvVar14 = (void *)__Znwm(uVar21);
        }
        puVar19 = (undefined1 *)((long)pvVar14 + sVar22) + 1;
        *(undefined1 *)((long)pvVar14 + sVar22) = 0xf4;
        _memcpy(pvVar14,pvVar4,sVar22);
        local_80 = SUB87(pvVar14,0);
        uStack_79._0_1_ = (undefined1)((ulong)pvVar14 >> 0x38);
        uStack_79._1_3_ = SUB83(puVar19,0);
        uStack_75 = (undefined5)((ulong)puVar19 >> 0x18);
        uStack_70 = (undefined1 *)((long)pvVar14 + uVar21);
        if (pvVar4 != (void *)0x0) {
          __ZdlPv(pvVar4);
        }
      }
      uStack_79._1_3_ = SUB83(puVar19,0);
      uStack_75 = (undefined5)((ulong)puVar19 >> 0x18);
      if (puVar19 < uStack_70) {
        puVar20 = puVar19 + 1;
        *puVar19 = 0x39;
      }
      else {
        pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
        sVar22 = (long)puVar19 - (long)pvVar4;
        uVar10 = sVar22 + 1;
        if ((long)uVar10 < 0) goto LAB_100227b24;
        uVar21 = ((long)uStack_70 - (long)pvVar4) * 2;
        if (uVar21 < uVar10 || uVar21 - uVar10 == 0) {
          uVar21 = uVar10;
        }
        if (0x3ffffffffffffffe < (ulong)((long)uStack_70 - (long)pvVar4)) {
          uVar21 = 0x7fffffffffffffff;
        }
        if (uVar21 == 0) {
          pvVar14 = (void *)0x0;
        }
        else {
          pvVar14 = (void *)__Znwm(uVar21);
        }
        puVar20 = (undefined1 *)((long)pvVar14 + sVar22) + 1;
        *(undefined1 *)((long)pvVar14 + sVar22) = 0x39;
        _memcpy(pvVar14,pvVar4,sVar22);
        local_80 = SUB87(pvVar14,0);
        uStack_79._0_1_ = (undefined1)((ulong)pvVar14 >> 0x38);
        uStack_79._1_3_ = SUB83(puVar20,0);
        uStack_75 = (undefined5)((ulong)puVar20 >> 0x18);
        uStack_70 = (undefined1 *)((long)pvVar14 + uVar21);
        if (pvVar4 != (void *)0x0) {
          __ZdlPv(pvVar4);
        }
      }
      uStack_79._1_3_ = SUB83(puVar20,0);
      uStack_75 = (undefined5)((ulong)puVar20 >> 0x18);
      FUN_10021b3fc(&local_80,puVar20,&DAT_100646038,&DAT_100646048,0x10);
      lVar26 = 0;
      puVar20 = (undefined1 *)CONCAT53(uStack_75,uStack_79._1_3_);
      do {
        uVar27 = *(undefined8 *)((long)&DAT_100646048 + lVar26);
        if (puVar20 < uStack_70) {
          puVar19 = puVar20 + 1;
          *puVar20 = (char)uVar27;
        }
        else {
          pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
          sVar22 = (long)puVar20 - (long)pvVar4;
          uVar10 = sVar22 + 1;
          if ((long)uVar10 < 0) goto LAB_100227b24;
          uVar21 = ((long)uStack_70 - (long)pvVar4) * 2;
          if (uVar21 < uVar10 || uVar21 - uVar10 == 0) {
            uVar21 = uVar10;
          }
          if (0x3ffffffffffffffe < (ulong)((long)uStack_70 - (long)pvVar4)) {
            uVar21 = 0x7fffffffffffffff;
          }
          if (uVar21 == 0) {
            pvVar14 = (void *)0x0;
          }
          else {
            pvVar14 = (void *)__Znwm(uVar21);
          }
          puVar19 = (undefined1 *)((long)pvVar14 + sVar22) + 1;
          *(undefined1 *)((long)pvVar14 + sVar22) = (char)uVar27;
          _memcpy(pvVar14,pvVar4,sVar22);
          local_80 = SUB87(pvVar14,0);
          uStack_79._0_1_ = (undefined1)((ulong)pvVar14 >> 0x38);
          uStack_79._1_3_ = SUB83(puVar19,0);
          uStack_75 = (undefined5)((ulong)puVar19 >> 0x18);
          uStack_70 = (undefined1 *)((long)pvVar14 + uVar21);
          if (pvVar4 != (void *)0x0) {
            __ZdlPv(pvVar4);
          }
        }
        uStack_79._1_3_ = SUB83(puVar19,0);
        uStack_75 = (undefined5)((ulong)puVar19 >> 0x18);
        uVar3 = (undefined1)((ulong)uVar27 >> 8);
        if (puVar19 < uStack_70) {
          puVar20 = puVar19 + 1;
          *puVar19 = uVar3;
        }
        else {
          pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
          sVar22 = (long)puVar19 - (long)pvVar4;
          uVar10 = sVar22 + 1;
          if ((long)uVar10 < 0) goto LAB_100227b24;
          uVar21 = ((long)uStack_70 - (long)pvVar4) * 2;
          if (uVar21 < uVar10 || uVar21 - uVar10 == 0) {
            uVar21 = uVar10;
          }
          if (0x3ffffffffffffffe < (ulong)((long)uStack_70 - (long)pvVar4)) {
            uVar21 = 0x7fffffffffffffff;
          }
          if (uVar21 == 0) {
            pvVar14 = (void *)0x0;
          }
          else {
            pvVar14 = (void *)__Znwm(uVar21);
          }
          puVar20 = (undefined1 *)((long)pvVar14 + sVar22) + 1;
          *(undefined1 *)((long)pvVar14 + sVar22) = uVar3;
          _memcpy(pvVar14,pvVar4,sVar22);
          local_80 = SUB87(pvVar14,0);
          uStack_79._0_1_ = (undefined1)((ulong)pvVar14 >> 0x38);
          uStack_79._1_3_ = SUB83(puVar20,0);
          uStack_75 = (undefined5)((ulong)puVar20 >> 0x18);
          uStack_70 = (undefined1 *)((long)pvVar14 + uVar21);
          if (pvVar4 != (void *)0x0) {
            __ZdlPv(pvVar4);
          }
        }
        uStack_79._1_3_ = SUB83(puVar20,0);
        uStack_75 = (undefined5)((ulong)puVar20 >> 0x18);
        uVar3 = (undefined1)((ulong)uVar27 >> 0x10);
        if (puVar20 < uStack_70) {
          puVar19 = puVar20 + 1;
          *puVar20 = uVar3;
        }
        else {
          pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
          sVar22 = (long)puVar20 - (long)pvVar4;
          uVar10 = sVar22 + 1;
          if ((long)uVar10 < 0) goto LAB_100227b24;
          uVar21 = ((long)uStack_70 - (long)pvVar4) * 2;
          if (uVar21 < uVar10 || uVar21 - uVar10 == 0) {
            uVar21 = uVar10;
          }
          if (0x3ffffffffffffffe < (ulong)((long)uStack_70 - (long)pvVar4)) {
            uVar21 = 0x7fffffffffffffff;
          }
          if (uVar21 == 0) {
            pvVar14 = (void *)0x0;
          }
          else {
            pvVar14 = (void *)__Znwm(uVar21);
          }
          puVar19 = (undefined1 *)((long)pvVar14 + sVar22) + 1;
          *(undefined1 *)((long)pvVar14 + sVar22) = uVar3;
          _memcpy(pvVar14,pvVar4,sVar22);
          local_80 = SUB87(pvVar14,0);
          uStack_79._0_1_ = (undefined1)((ulong)pvVar14 >> 0x38);
          uStack_79._1_3_ = SUB83(puVar19,0);
          uStack_75 = (undefined5)((ulong)puVar19 >> 0x18);
          uStack_70 = (undefined1 *)((long)pvVar14 + uVar21);
          if (pvVar4 != (void *)0x0) {
            __ZdlPv(pvVar4);
          }
        }
        uStack_79._1_3_ = SUB83(puVar19,0);
        uStack_75 = (undefined5)((ulong)puVar19 >> 0x18);
        uVar3 = (undefined1)((ulong)uVar27 >> 0x18);
        if (puVar19 < uStack_70) {
          puVar20 = puVar19 + 1;
          *puVar19 = uVar3;
        }
        else {
          pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
          sVar22 = (long)puVar19 - (long)pvVar4;
          uVar10 = sVar22 + 1;
          if ((long)uVar10 < 0) goto LAB_100227b24;
          uVar21 = ((long)uStack_70 - (long)pvVar4) * 2;
          if (uVar21 < uVar10 || uVar21 - uVar10 == 0) {
            uVar21 = uVar10;
          }
          if (0x3ffffffffffffffe < (ulong)((long)uStack_70 - (long)pvVar4)) {
            uVar21 = 0x7fffffffffffffff;
          }
          if (uVar21 == 0) {
            pvVar14 = (void *)0x0;
          }
          else {
            pvVar14 = (void *)__Znwm(uVar21);
          }
          puVar20 = (undefined1 *)((long)pvVar14 + sVar22) + 1;
          *(undefined1 *)((long)pvVar14 + sVar22) = uVar3;
          _memcpy(pvVar14,pvVar4,sVar22);
          local_80 = SUB87(pvVar14,0);
          uStack_79._0_1_ = (undefined1)((ulong)pvVar14 >> 0x38);
          uStack_79._1_3_ = SUB83(puVar20,0);
          uStack_75 = (undefined5)((ulong)puVar20 >> 0x18);
          uStack_70 = (undefined1 *)((long)pvVar14 + uVar21);
          if (pvVar4 != (void *)0x0) {
            __ZdlPv(pvVar4);
          }
        }
        uStack_79._1_3_ = SUB83(puVar20,0);
        uStack_75 = (undefined5)((ulong)puVar20 >> 0x18);
        uVar3 = (undefined1)((ulong)uVar27 >> 0x20);
        if (puVar20 < uStack_70) {
          puVar19 = puVar20 + 1;
          *puVar20 = uVar3;
        }
        else {
          pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
          sVar22 = (long)puVar20 - (long)pvVar4;
          uVar10 = sVar22 + 1;
          if ((long)uVar10 < 0) goto LAB_100227b24;
          uVar21 = ((long)uStack_70 - (long)pvVar4) * 2;
          if (uVar21 < uVar10 || uVar21 - uVar10 == 0) {
            uVar21 = uVar10;
          }
          if (0x3ffffffffffffffe < (ulong)((long)uStack_70 - (long)pvVar4)) {
            uVar21 = 0x7fffffffffffffff;
          }
          if (uVar21 == 0) {
            pvVar14 = (void *)0x0;
          }
          else {
            pvVar14 = (void *)__Znwm(uVar21);
          }
          puVar19 = (undefined1 *)((long)pvVar14 + sVar22) + 1;
          *(undefined1 *)((long)pvVar14 + sVar22) = uVar3;
          _memcpy(pvVar14,pvVar4,sVar22);
          local_80 = SUB87(pvVar14,0);
          uStack_79._0_1_ = (undefined1)((ulong)pvVar14 >> 0x38);
          uStack_79._1_3_ = SUB83(puVar19,0);
          uStack_75 = (undefined5)((ulong)puVar19 >> 0x18);
          uStack_70 = (undefined1 *)((long)pvVar14 + uVar21);
          if (pvVar4 != (void *)0x0) {
            __ZdlPv(pvVar4);
          }
        }
        uStack_79._1_3_ = SUB83(puVar19,0);
        uStack_75 = (undefined5)((ulong)puVar19 >> 0x18);
        uVar3 = (undefined1)((ulong)uVar27 >> 0x28);
        if (puVar19 < uStack_70) {
          puVar20 = puVar19 + 1;
          *puVar19 = uVar3;
        }
        else {
          pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
          sVar22 = (long)puVar19 - (long)pvVar4;
          uVar10 = sVar22 + 1;
          if ((long)uVar10 < 0) goto LAB_100227b24;
          uVar21 = ((long)uStack_70 - (long)pvVar4) * 2;
          if (uVar21 < uVar10 || uVar21 - uVar10 == 0) {
            uVar21 = uVar10;
          }
          if (0x3ffffffffffffffe < (ulong)((long)uStack_70 - (long)pvVar4)) {
            uVar21 = 0x7fffffffffffffff;
          }
          if (uVar21 == 0) {
            pvVar14 = (void *)0x0;
          }
          else {
            pvVar14 = (void *)__Znwm(uVar21);
          }
          puVar20 = (undefined1 *)((long)pvVar14 + sVar22) + 1;
          *(undefined1 *)((long)pvVar14 + sVar22) = uVar3;
          _memcpy(pvVar14,pvVar4,sVar22);
          local_80 = SUB87(pvVar14,0);
          uStack_79._0_1_ = (undefined1)((ulong)pvVar14 >> 0x38);
          uStack_79._1_3_ = SUB83(puVar20,0);
          uStack_75 = (undefined5)((ulong)puVar20 >> 0x18);
          uStack_70 = (undefined1 *)((long)pvVar14 + uVar21);
          if (pvVar4 != (void *)0x0) {
            __ZdlPv(pvVar4);
          }
        }
        uStack_79._1_3_ = SUB83(puVar20,0);
        uStack_75 = (undefined5)((ulong)puVar20 >> 0x18);
        uVar3 = (undefined1)((ulong)uVar27 >> 0x30);
        if (puVar20 < uStack_70) {
          puVar19 = puVar20 + 1;
          *puVar20 = uVar3;
        }
        else {
          pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
          sVar22 = (long)puVar20 - (long)pvVar4;
          uVar10 = sVar22 + 1;
          if ((long)uVar10 < 0) goto LAB_100227b24;
          uVar21 = ((long)uStack_70 - (long)pvVar4) * 2;
          if (uVar21 < uVar10 || uVar21 - uVar10 == 0) {
            uVar21 = uVar10;
          }
          if (0x3ffffffffffffffe < (ulong)((long)uStack_70 - (long)pvVar4)) {
            uVar21 = 0x7fffffffffffffff;
          }
          if (uVar21 == 0) {
            pvVar14 = (void *)0x0;
          }
          else {
            pvVar14 = (void *)__Znwm(uVar21);
          }
          puVar19 = (undefined1 *)((long)pvVar14 + sVar22) + 1;
          *(undefined1 *)((long)pvVar14 + sVar22) = uVar3;
          _memcpy(pvVar14,pvVar4,sVar22);
          local_80 = SUB87(pvVar14,0);
          uStack_79._0_1_ = (undefined1)((ulong)pvVar14 >> 0x38);
          uStack_79._1_3_ = SUB83(puVar19,0);
          uStack_75 = (undefined5)((ulong)puVar19 >> 0x18);
          uStack_70 = (undefined1 *)((long)pvVar14 + uVar21);
          if (pvVar4 != (void *)0x0) {
            __ZdlPv(pvVar4);
          }
        }
        uStack_79._1_3_ = SUB83(puVar19,0);
        uStack_75 = (undefined5)((ulong)puVar19 >> 0x18);
        uVar3 = (undefined1)((ulong)uVar27 >> 0x38);
        if (puVar19 < uStack_70) {
          puVar20 = puVar19 + 1;
          *puVar19 = uVar3;
        }
        else {
          pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
          sVar22 = (long)puVar19 - (long)pvVar4;
          uVar10 = sVar22 + 1;
          if ((long)uVar10 < 0) goto LAB_100227b24;
          uVar21 = ((long)uStack_70 - (long)pvVar4) * 2;
          if (uVar21 < uVar10 || uVar21 - uVar10 == 0) {
            uVar21 = uVar10;
          }
          if (0x3ffffffffffffffe < (ulong)((long)uStack_70 - (long)pvVar4)) {
            uVar21 = 0x7fffffffffffffff;
          }
          if (uVar21 == 0) {
            pvVar14 = (void *)0x0;
          }
          else {
            pvVar14 = (void *)__Znwm(uVar21);
          }
          puVar20 = (undefined1 *)((long)pvVar14 + sVar22) + 1;
          *(undefined1 *)((long)pvVar14 + sVar22) = uVar3;
          _memcpy(pvVar14,pvVar4,sVar22);
          local_80 = SUB87(pvVar14,0);
          uStack_79._0_1_ = (undefined1)((ulong)pvVar14 >> 0x38);
          uStack_79._1_3_ = SUB83(puVar20,0);
          uStack_75 = (undefined5)((ulong)puVar20 >> 0x18);
          uStack_70 = (undefined1 *)((long)pvVar14 + uVar21);
          if (pvVar4 != (void *)0x0) {
            __ZdlPv(pvVar4);
          }
        }
        uStack_79._1_3_ = SUB83(puVar20,0);
        uStack_75 = (undefined5)((ulong)puVar20 >> 0x18);
        lVar26 = lVar26 + 8;
      } while (lVar26 != 0x58);
      uVar10 = FUN_100227f70(&local_80,"alpha");
      if (((((((int)uVar10 == 0) || (uVar10 = FUN_100227f70(&local_80,"alpha-se"), (int)uVar10 == 0)
             ) || (uVar10 = FUN_100227f70(&local_80,"desktop-v1"), (int)uVar10 == 0)) ||
           (((uVar10 = FUN_100227f70(&local_80,"production"), (int)uVar10 == 0 ||
             (uVar10 = FUN_100227f70(&local_80,"macos-arm64"), (int)uVar10 == 0)) ||
            ((uVar10 = FUN_100227f70(&local_80,
                                     "alpha-security-host:2026-09-30:macos-arm64:v2:sdk-2.0.1:sdk-2.0.2:native-envelope-v2:expiry-sdk-2.1.0"
                                    ), (int)uVar10 == 0 ||
             ((uVar10 = FUN_100227f70(&local_80,"alpha.native.v1.NativeCallRequest"),
              (int)uVar10 == 0 || (uVar10 = FUN_100227f70(&local_80,"2.1.0"), (int)uVar10 == 0))))))
           )) || (uVar10 = FUN_100227f70(&local_80,"xunchahaha/alpha-wcdb"), (int)uVar10 == 0)) ||
         ((uVar10 = FUN_100227f70(&local_80,"alpha-guard-sdk-v2.1.0"), (int)uVar10 == 0 ||
          (uVar10 = FUN_100227f70(&local_80,
                                  "8636733f62cbf4087f468312885e20499e0ae18822fd997dea599a7b79552512"
                                 ), (int)uVar10 == 0)))) {
LAB_100227bbc:
        pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
      }
      else {
        puVar20 = (undefined1 *)CONCAT53(uStack_75,uStack_79._1_3_);
        if (puVar20 < uStack_70) {
          puVar19 = puVar20 + 1;
          *puVar20 = 3;
        }
        else {
          pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
          sVar22 = (long)puVar20 - (long)pvVar4;
          uVar10 = sVar22 + 1;
          if ((long)uVar10 < 0) goto LAB_100227b24;
          uVar21 = ((long)uStack_70 - (long)pvVar4) * 2;
          if (uVar21 < uVar10 || uVar21 - uVar10 == 0) {
            uVar21 = uVar10;
          }
          if (0x3ffffffffffffffe < (ulong)((long)uStack_70 - (long)pvVar4)) {
            uVar21 = 0x7fffffffffffffff;
          }
          if (uVar21 == 0) {
            pvVar14 = (void *)0x0;
          }
          else {
            pvVar14 = (void *)__Znwm(uVar21);
          }
          puVar19 = (undefined1 *)((long)pvVar14 + sVar22) + 1;
          *(undefined1 *)((long)pvVar14 + sVar22) = 3;
          _memcpy(pvVar14,pvVar4,sVar22);
          local_80 = SUB87(pvVar14,0);
          uStack_79._0_1_ = (undefined1)((ulong)pvVar14 >> 0x38);
          uStack_79._1_3_ = SUB83(puVar19,0);
          uStack_75 = (undefined5)((ulong)puVar19 >> 0x18);
          uStack_70 = (undefined1 *)((long)pvVar14 + uVar21);
          if (pvVar4 != (void *)0x0) {
            __ZdlPv(pvVar4);
          }
        }
        uStack_79._1_3_ = SUB83(puVar19,0);
        uStack_75 = (undefined5)((ulong)puVar19 >> 0x18);
        if (puVar19 < uStack_70) {
          puVar20 = puVar19 + 1;
          *puVar19 = 0;
        }
        else {
          pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
          sVar22 = (long)puVar19 - (long)pvVar4;
          uVar10 = sVar22 + 1;
          if ((long)uVar10 < 0) goto LAB_100227b24;
          uVar21 = ((long)uStack_70 - (long)pvVar4) * 2;
          if (uVar21 < uVar10 || uVar21 - uVar10 == 0) {
            uVar21 = uVar10;
          }
          if (0x3ffffffffffffffe < (ulong)((long)uStack_70 - (long)pvVar4)) {
            uVar21 = 0x7fffffffffffffff;
          }
          if (uVar21 == 0) {
            pvVar14 = (void *)0x0;
          }
          else {
            pvVar14 = (void *)__Znwm(uVar21);
          }
          puVar20 = (undefined1 *)((long)pvVar14 + sVar22) + 1;
          *(undefined1 *)((long)pvVar14 + sVar22) = 0;
          _memcpy(pvVar14,pvVar4,sVar22);
          local_80 = SUB87(pvVar14,0);
          uStack_79._0_1_ = (undefined1)((ulong)pvVar14 >> 0x38);
          uStack_79._1_3_ = SUB83(puVar20,0);
          uStack_75 = (undefined5)((ulong)puVar20 >> 0x18);
          uStack_70 = (undefined1 *)((long)pvVar14 + uVar21);
          if (pvVar4 != (void *)0x0) {
            __ZdlPv(pvVar4);
          }
        }
        uStack_79._1_3_ = SUB83(puVar20,0);
        uStack_75 = (undefined5)((ulong)puVar20 >> 0x18);
        uVar10 = FUN_100227f70(&local_80,"alpha.native.v1");
        if ((((int)uVar10 == 0) ||
            (uVar10 = FUN_100227f70(&local_80,"alpha.private-component-runtime.v1"),
            (int)uVar10 == 0)) ||
           (uVar10 = FUN_100227f70(&local_80,"alpha.security.transport.v1"), (int)uVar10 == 0))
        goto LAB_100227bbc;
        puVar20 = (undefined1 *)CONCAT53(uStack_75,uStack_79._1_3_);
        if (puVar20 < uStack_70) {
          puVar19 = puVar20 + 1;
          *puVar20 = 0x37;
        }
        else {
          pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
          sVar22 = (long)puVar20 - (long)pvVar4;
          uVar10 = sVar22 + 1;
          if ((long)uVar10 < 0) goto LAB_100227b24;
          uVar21 = ((long)uStack_70 - (long)pvVar4) * 2;
          if (uVar21 < uVar10 || uVar21 - uVar10 == 0) {
            uVar21 = uVar10;
          }
          if (0x3ffffffffffffffe < (ulong)((long)uStack_70 - (long)pvVar4)) {
            uVar21 = 0x7fffffffffffffff;
          }
          if (uVar21 == 0) {
            pvVar14 = (void *)0x0;
          }
          else {
            pvVar14 = (void *)__Znwm(uVar21);
          }
          puVar19 = (undefined1 *)((long)pvVar14 + sVar22) + 1;
          *(undefined1 *)((long)pvVar14 + sVar22) = 0x37;
          _memcpy(pvVar14,pvVar4,sVar22);
          local_80 = SUB87(pvVar14,0);
          uStack_79._0_1_ = (undefined1)((ulong)pvVar14 >> 0x38);
          uStack_79._1_3_ = SUB83(puVar19,0);
          uStack_75 = (undefined5)((ulong)puVar19 >> 0x18);
          uStack_70 = (undefined1 *)((long)pvVar14 + uVar21);
          if (pvVar4 != (void *)0x0) {
            __ZdlPv(pvVar4);
          }
        }
        uStack_79._1_3_ = SUB83(puVar19,0);
        uStack_75 = (undefined5)((ulong)puVar19 >> 0x18);
        if (puVar19 < uStack_70) {
          puVar20 = puVar19 + 1;
          *puVar19 = 0;
        }
        else {
          pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
          sVar22 = (long)puVar19 - (long)pvVar4;
          uVar10 = sVar22 + 1;
          if ((long)uVar10 < 0) {
LAB_100227b24:
                    /* WARNING: Subroutine does not return */
            FUN_100216814();
          }
          uVar21 = ((long)uStack_70 - (long)pvVar4) * 2;
          if (uVar21 < uVar10 || uVar21 - uVar10 == 0) {
            uVar21 = uVar10;
          }
          if (0x3ffffffffffffffe < (ulong)((long)uStack_70 - (long)pvVar4)) {
            uVar21 = 0x7fffffffffffffff;
          }
          if (uVar21 == 0) {
            pvVar14 = (void *)0x0;
          }
          else {
            pvVar14 = (void *)__Znwm(uVar21);
          }
          puVar20 = (undefined1 *)((long)pvVar14 + sVar22) + 1;
          *(undefined1 *)((long)pvVar14 + sVar22) = 0;
          _memcpy(pvVar14,pvVar4,sVar22);
          local_80 = SUB87(pvVar14,0);
          uStack_79._0_1_ = (undefined1)((ulong)pvVar14 >> 0x38);
          uStack_79._1_3_ = SUB83(puVar20,0);
          uStack_75 = (undefined5)((ulong)puVar20 >> 0x18);
          uStack_70 = (undefined1 *)((long)pvVar14 + uVar21);
          if (pvVar4 != (void *)0x0) {
            __ZdlPv(pvVar4);
          }
        }
        lVar26 = 0;
        uStack_79._1_3_ = SUB83(puVar20,0);
        uStack_75 = (undefined5)((ulong)puVar20 >> 0x18);
        do {
          uVar10 = FUN_100227f70(&local_80,
                                 *(undefined8 *)
                                  ((long)&PTR_s_authorize_operation_1007cf570 + lVar26));
          bVar6 = lVar26 != 0x1b0;
          lVar26 = lVar26 + 8;
          uVar24 = 0;
          if (bVar6) {
            uVar24 = (uint)uVar10;
          }
        } while ((uVar24 & 1) != 0);
        if ((uint)uVar10 == 0) goto LAB_100227bbc;
        pvVar4 = (void *)CONCAT17((undefined1)uStack_79,local_80);
        if (CONCAT53(uStack_75,uStack_79._1_3_) - (long)pvVar4 == 0x814) {
          iVar7 = _memcmp(pvVar4,"APOL-BIND-v1",0x814);
          uVar10 = (ulong)(iVar7 == 0);
          goto LAB_100227bbc;
        }
        uVar10 = 0;
      }
      if (pvVar4 != (void *)0x0) {
        uStack_79._1_3_ = SUB83(pvVar4,0);
        uStack_75 = (undefined5)((ulong)pvVar4 >> 0x18);
        __ZdlPv(pvVar4);
      }
      goto LAB_100226594;
    }
  }
  else {
LAB_100226588:
    __ZdlPv(puVar8);
  }
  uVar10 = 0;
LAB_100226594:
  if (*(long *)PTR____stack_chk_guard_1007c41d0 == local_68) {
    return;
  }
                    /* WARNING: Subroutine does not return */
  ___stack_chk_fail(uVar10);
}

