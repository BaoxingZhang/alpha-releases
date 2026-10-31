
void FUN_1001f2be8(ulong param_1,char *param_2,ulong param_3,uint param_4)

{
  ulong *puVar1;
  undefined1 auVar2 [16];
  long lVar3;
  int iVar4;
  undefined4 uVar5;
  ulong *puVar6;
  ulong uVar7;
  ulong uVar8;
  ulong uVar9;
  ulong uVar10;
  ulong uVar11;
  ulong uVar12;
  uint local_130 [2];
  ulong local_128;
  uint local_120;
  uint local_118;
  uint local_110 [2];
  ulong local_108;
  uint local_100;
  uint local_f8;
  ulong local_f0;
  ulong local_e8;
  long local_e0;
  undefined8 uStack_d8;
  ulong local_d0;
  ulong uStack_c8;
  ulong local_c0;
  undefined8 uStack_b8;
  undefined8 local_b0;
  undefined8 uStack_a8;
  undefined8 uStack_a0;
  undefined8 uStack_98;
  undefined8 local_90;
  undefined8 uStack_88;
  undefined8 uStack_80;
  undefined8 uStack_78;
  long local_70;
  
  local_70 = *(long *)PTR____stack_chk_guard_1007c41d0;
  if (*param_2 == '\x01') {
    puVar1 = (ulong *)(param_2 + 8);
    puVar6 = puVar1;
    if (param_4 != 0) {
      local_f0 = 0x6afcea7f;
      puVar6 = &local_f0;
      if (*puVar1 < 0x6afcea80) {
        puVar6 = puVar1;
      }
    }
    if ((DAT_100818168 ^ DAT_100818160) == 0xffffffffffffffff) {
      uVar12 = *puVar6;
      if ((DAT_10081d968 & 1) == 0) {
        iVar4 = FUN_100226248();
        if (iVar4 != 0) {
          FUN_10022a0b8();
          iVar4 = FUN_10021bafc(&DAT_10081da00,uVar12,param_3);
          if (iVar4 != 0) {
            iVar4 = FUN_10021ca88(&DAT_10081da00);
            uVar5 = 0xffffff98;
            if (iVar4 == 0) {
              uVar5 = 0xffffff99;
            }
            if (((param_3 & 1) != 0) || (iVar4 == 0)) goto LAB_1001f3198;
            iVar4 = FUN_100217224(FUN_1001f4aa4,&DAT_100818390,&DAT_10081d9c0);
            DAT_10081d96a = (byte)iVar4;
            if (iVar4 == 0) {
              DAT_10081d969 = 0;
              uVar5 = 0xffffff99;
              goto LAB_1001f3198;
            }
            DAT_10081d969 = FUN_10021939c(FUN_1001f4aa4,&DAT_10081d9c0);
            if ((DAT_10081d969 & 1) != 0) {
              uStack_88 = 0;
              local_90 = 0;
              uStack_78 = 0;
              uStack_80 = 0;
              uStack_a8 = 0;
              local_b0 = 0;
              uStack_98 = 0;
              uStack_a0 = 0;
              uStack_b8 = 0;
              uStack_d8 = 0;
              local_e0 = 0;
              local_e8 = 0;
              uVar7 = (DAT_100818270 >> 0x35 | DAT_100818270 << 0xb) ^
                      (DAT_1008181d0 >> 0x19 | DAT_1008181d0 << 0x27) ^ DAT_100818310;
              uVar7 = uVar12 ^ (uVar7 >> 0x2d | uVar7 << 0x13);
              uVar7 = (uVar7 ^ uVar7 >> 0x1e) * -0x40a7b892e31b1a47;
              local_d0 = (uVar7 ^ uVar7 >> 0x1b) * -0x6b2fb644ecceee15;
              local_d0 = local_d0 ^ local_d0 >> 0x1f;
              uVar7 = local_d0 ^ (uVar12 >> 7 | uVar12 << 0x39);
              uVar7 = (uVar7 ^ uVar7 >> 0x1e) * -0x40a7b892e31b1a47;
              uStack_c8 = (uVar7 ^ uVar7 >> 0x1b) * -0x6b2fb644ecceee15;
              uStack_c8 = uStack_c8 ^ uStack_c8 >> 0x1f;
              local_c0 = uStack_c8 ^ local_d0;
              local_f0 = uVar12;
              FUN_1001f5228(local_110,&local_f0);
              FUN_1001f621c(local_130,&local_f0);
              uVar7 = (DAT_1008182a0 >> 0x27 | DAT_1008182a0 << 0x19) ^
                      (DAT_100818200 >> 0x2f | DAT_100818200 << 0x11) ^ DAT_100818340;
              uVar7 = (uVar7 >> 0x2d | uVar7 << 0x13) ^ 0xfa44f402f6c078a5;
              uVar7 = (uVar7 ^ uVar7 >> 0x1e) * -0x40a7b892e31b1a47;
              uVar7 = (uVar7 ^ uVar7 >> 0x1b) * -0x6b2fb644ecceee15;
              uVar5 = 0xffffff9b;
              if ((((local_128 ^ uVar7 >> 0x1f ^ uVar7) != 0xd33c03aa1a4fe17b) ||
                  (uVar7 = (DAT_100818270 >> 0x35 | DAT_100818270 << 0xb) ^
                           (DAT_1008181d0 >> 0x19 | DAT_1008181d0 << 0x27) ^ DAT_100818310,
                  uVar7 = (uVar7 >> 0x2d | uVar7 << 0x13) ^ 0xced9862fe486084b,
                  uVar7 = (uVar7 ^ uVar7 >> 0x1e) * -0x40a7b892e31b1a47,
                  uVar7 = (uVar7 ^ uVar7 >> 0x1b) * -0x6b2fb644ecceee15,
                  (local_108 ^ uVar7 >> 0x1f ^ uVar7) != 0x7fa468dca5dda150)) ||
                 ((local_110[0] & local_130[0] & local_100 & local_120 & local_f8 & local_118 & 1)
                  == 0)) goto LAB_1001f3198;
              FUN_1001f4ae0(&local_f0);
              if ((char)local_f0 != '\x01') goto LAB_1001f3454;
              DAT_10081d970 = local_e8;
              DAT_10081d978 = local_e0;
              uVar7 = *puVar1;
              if ((local_e8 != 0) && (uVar7 + 300 < local_e8)) goto LAB_1001f3194;
              DAT_10081d988 = *(ulong *)(param_2 + 0x10);
              uVar10 = local_e8;
              if (local_e8 <= uVar7) {
                uVar10 = uVar7;
              }
              uVar9 = local_e8;
              if (param_4 == 0) {
                uVar9 = uVar10;
              }
              DAT_10081d980 = uVar7;
              if (((local_f0 & 0x100) != 0) || (uVar9 != local_e8)) {
                DAT_10081d978 = local_e0 + 1;
                iVar4 = FUN_1001f4b74(uVar9);
                if (iVar4 == 0) goto LAB_1001f3454;
              }
              DAT_10081d970 = uVar9;
              uVar7 = FUN_1001f4e3c(param_2);
              if ((uVar7 & 1) != 0) {
                DAT_10081d968 = 1;
                goto LAB_1001f2f7c;
              }
            }
          }
        }
      }
      else {
        if ((param_3 & 1) != 0) {
          uVar5 = 0xffffff98;
          goto LAB_1001f3198;
        }
LAB_1001f2f7c:
        if ((DAT_10081d969 == 1) && (iVar4 = FUN_10021ca88(&DAT_10081da00), iVar4 != 0)) {
          uStack_88 = 0;
          local_90 = 0;
          uStack_78 = 0;
          uStack_80 = 0;
          uStack_a8 = 0;
          local_b0 = 0;
          uStack_98 = 0;
          uStack_a0 = 0;
          uStack_b8 = 0;
          uStack_d8 = 0;
          local_e0 = 0;
          local_e8 = 0;
          uVar7 = (DAT_100818278 >> 0x28 | DAT_100818278 << 0x18) ^
                  (DAT_1008181d8 >> 0x12 | DAT_1008181d8 << 0x2e) ^ DAT_100818318;
          uVar7 = uVar12 ^ (uVar7 >> 0x2d | uVar7 << 0x13);
          uVar7 = (uVar7 ^ uVar7 >> 0x1e) * -0x40a7b892e31b1a47;
          local_d0 = (uVar7 ^ uVar7 >> 0x1b) * -0x6b2fb644ecceee15;
          local_d0 = local_d0 ^ local_d0 >> 0x1f;
          uVar9 = uVar12 >> 7 | uVar12 << 0x39;
          uVar7 = local_d0 ^ uVar9;
          uVar7 = (uVar7 ^ uVar7 >> 0x1e) * -0x40a7b892e31b1a47;
          uStack_c8 = (uVar7 ^ uVar7 >> 0x1b) * -0x6b2fb644ecceee15;
          uStack_c8 = uStack_c8 ^ uStack_c8 >> 0x1f;
          local_c0 = uStack_c8 ^ local_d0;
          local_f0 = uVar12;
          FUN_1002014cc(local_110,&local_f0);
          FUN_1002024c0(local_130,&local_f0);
          uVar7 = (DAT_100818278 >> 0x28 | DAT_100818278 << 0x18) ^
                  (DAT_1008181d8 >> 0x12 | DAT_1008181d8 << 0x2e) ^ DAT_100818318;
          uVar7 = (uVar7 >> 0x2d | uVar7 << 0x13) ^ 0x2b6b6dd3123a705a;
          uVar7 = (uVar7 ^ uVar7 >> 0x1e) * -0x40a7b892e31b1a47;
          uVar7 = (uVar7 ^ uVar7 >> 0x1b) * -0x6b2fb644ecceee15;
          uVar10 = (DAT_1008182a8 >> 0x1a | DAT_1008182a8 << 0x26) ^
                   (DAT_100818208 >> 0x28 | DAT_100818208 << 0x18) ^ DAT_100818348;
          uVar10 = (uVar10 >> 0x2d | uVar10 << 0x13) ^ 0x56d6dba62474e0b4;
          uVar10 = (uVar10 ^ uVar10 >> 0x1e) * -0x40a7b892e31b1a47;
          uVar10 = (uVar10 ^ uVar10 >> 0x1b) * -0x6b2fb644ecceee15;
          if (((local_128 ^ uVar10 >> 0x1f ^ uVar10) != 0x10ae1a1287152aee ||
              (local_108 ^ uVar7 >> 0x1f ^ uVar7) != 0x711cb788f10c2eaa) ||
              (local_110[0] & local_130[0] & local_100 & local_120 & local_f8 & local_118 & 1) == 0)
          {
            uVar5 = 0xffffff9b;
            goto LAB_1001f3198;
          }
          if (DAT_10081d988 <= *(ulong *)(param_2 + 0x10)) {
            uVar7 = *puVar1 + 300;
            if (((*(ulong *)(param_2 + 0x10) - DAT_10081d988) + DAT_10081d980 <= uVar7) &&
               (DAT_10081d970 <= uVar7)) {
              if (((param_4 & 1) == 0) && (DAT_10081d970 + 0x3c <= *puVar1)) {
                DAT_10081d978 = DAT_10081d978 + 1;
                iVar4 = FUN_1001f4b74();
                if (iVar4 == 0) {
LAB_1001f3454:
                  uVar5 = 0xffffff97;
                  goto LAB_1001f3198;
                }
                DAT_10081d970 = *puVar1;
              }
              uVar11 = DAT_10081da68;
              uVar10 = DAT_10081da08;
              lVar3 = DAT_10081d9b8;
              LOAcquire();
              DAT_10081d9b8 = DAT_10081d9b8 + 1;
              LORelease();
              uVar8 = *(ulong *)(param_2 + 0x10);
              uVar7 = DAT_10081d990 + 10;
              if (uVar7 <= uVar8) {
                if (((DAT_10081d96a & 1) == 0) ||
                   (iVar4 = FUN_10021939c(FUN_1001f4aa4,&DAT_10081d9c0), iVar4 == 0)) {
                  DAT_10081d969 = 0;
                  uVar5 = 0xffffff99;
                  goto LAB_1001f3198;
                }
                uVar8 = *(ulong *)(param_2 + 0x10);
                uVar7 = DAT_10081d990 + 10;
              }
              uVar10 = (uVar10 ^ uVar11 ^ (uVar10 ^ uVar11) >> 0x1e) * -0x40a7b892e31b1a47;
              uVar11 = (uVar10 ^ uVar10 >> 0x1b) * -0x6b2fb644ecceee15;
              uVar10 = lVar3 + 1;
              if (uVar7 <= uVar8) {
                DAT_10081d990 = uVar8;
              }
              auVar2._8_8_ = 0;
              auVar2._0_8_ = uVar10;
              uVar7 = (ulong)~((int)uVar10 +
                              ((uint)((int)(uVar10 - SUB168(auVar2 * ZEXT816(0x842108421084211),8)
                                           >> 1) + SUB164(auVar2 * ZEXT816(0x842108421084211),8)) >>
                              4) * -0x1f) & 0x3f;
              uVar7 = param_1 ^ uVar11 >> 0x1f ^
                      (uVar8 >> uVar7 | uVar8 << 0x40 - uVar7) ^ DAT_100818160 ^
                      *puVar1 ^ uVar10 ^ uVar11;
              uVar7 = (uVar7 ^ uVar7 >> 0x1e) * -0x40a7b892e31b1a47;
              uVar7 = (uVar7 ^ uVar7 >> 0x1b) * -0x6b2fb644ecceee15;
              DAT_100818160 = uVar7 ^ uVar7 >> 0x1f;
              DAT_100818168 = uVar7 ^ uVar7 >> 0x1f ^ 0xffffffffffffffff;
              uStack_88 = 0;
              local_90 = 0;
              uStack_78 = 0;
              uStack_80 = 0;
              uStack_a8 = 0;
              local_b0 = 0;
              uStack_98 = 0;
              uStack_a0 = 0;
              uStack_b8 = 0;
              uStack_d8 = 0;
              local_e0 = 0;
              local_e8 = 0;
              uVar7 = (DAT_100818278 >> 0x28 | DAT_100818278 << 0x18) ^
                      (DAT_1008181d8 >> 0x12 | DAT_1008181d8 << 0x2e) ^ DAT_100818318;
              uVar7 = uVar12 ^ (uVar7 >> 0x2d | uVar7 << 0x13);
              uVar7 = (uVar7 ^ uVar7 >> 0x1e) * -0x40a7b892e31b1a47;
              local_d0 = (uVar7 ^ uVar7 >> 0x1b) * -0x6b2fb644ecceee15;
              local_d0 = local_d0 ^ local_d0 >> 0x1f;
              uVar9 = local_d0 ^ uVar9;
              uVar7 = (uVar9 ^ uVar9 >> 0x1e) * -0x40a7b892e31b1a47;
              uStack_c8 = (uVar7 ^ uVar7 >> 0x1b) * -0x6b2fb644ecceee15;
              uStack_c8 = uStack_c8 ^ uStack_c8 >> 0x1f;
              local_c0 = uStack_c8 ^ local_d0;
              local_f0 = uVar12;
              FUN_1002014cc(local_110,&local_f0);
              FUN_1002024c0(local_130,&local_f0);
              uVar12 = (DAT_100818278 >> 0x28 | DAT_100818278 << 0x18) ^
                       (DAT_1008181d8 >> 0x12 | DAT_1008181d8 << 0x2e) ^ DAT_100818318;
              uVar12 = (uVar12 >> 0x2d | uVar12 << 0x13) ^ 0x2b6b6dd3123a705a;
              uVar12 = (uVar12 ^ uVar12 >> 0x1e) * -0x40a7b892e31b1a47;
              uVar12 = (uVar12 ^ uVar12 >> 0x1b) * -0x6b2fb644ecceee15;
              uVar7 = (DAT_1008182a8 >> 0x1a | DAT_1008182a8 << 0x26) ^
                      (DAT_100818208 >> 0x28 | DAT_100818208 << 0x18) ^ DAT_100818348;
              uVar7 = (uVar7 >> 0x2d | uVar7 << 0x13) ^ 0x56d6dba62474e0b4;
              uVar7 = (uVar7 ^ uVar7 >> 0x1e) * -0x40a7b892e31b1a47;
              uVar7 = (uVar7 ^ uVar7 >> 0x1b) * -0x6b2fb644ecceee15;
              uVar5 = 0xffffff9b;
              if (((local_110[0] & local_130[0] & local_100 & local_120 & local_f8 & local_118 & 1)
                   != 0 && (local_108 ^ uVar12 >> 0x1f ^ uVar12) == 0x711cb788f10c2eaa) &&
                  (local_128 ^ uVar7 >> 0x1f ^ uVar7) == 0x10ae1a1287152aee) {
                uVar5 = 0;
              }
              goto LAB_1001f3198;
            }
          }
          goto LAB_1001f3194;
        }
      }
    }
    uVar5 = 0xffffff99;
  }
  else {
LAB_1001f3194:
    uVar5 = 0xffffff9a;
  }
LAB_1001f3198:
  if (*(long *)PTR____stack_chk_guard_1007c41d0 == local_70) {
    return;
  }
                    /* WARNING: Subroutine does not return */
  ___stack_chk_fail(uVar5);
}

