
void FUN_1001f452c(long param_1,ulong param_2,undefined8 param_3,undefined8 param_4,ulong param_5)

{
  uint uVar1;
  uint uVar2;
  uint uVar3;
  uint uVar4;
  uint uVar5;
  uint uVar6;
  int iVar7;
  ulong uVar8;
  ulong uVar9;
  ulong uVar10;
  ulong uVar11;
  ulong uVar12;
  ulong uVar13;
  byte local_2d8 [8];
  ulong local_2d0;
  ulong local_2c0;
  undefined1 auStack_2b8 [8];
  undefined8 local_2b0;
  undefined8 local_250;
  undefined8 uStack_248;
  undefined8 local_240;
  undefined8 uStack_238;
  undefined1 auStack_230 [192];
  ulong local_170 [4];
  undefined8 local_150;
  ulong local_148;
  ulong local_140;
  ulong local_138;
  undefined8 local_130;
  undefined8 uStack_128;
  ulong local_120;
  ulong uStack_118;
  undefined8 local_110;
  undefined8 local_108;
  ulong local_f8;
  ulong uStack_f0;
  undefined8 local_e8;
  undefined8 uStack_e0;
  ulong local_d8;
  ulong uStack_d0;
  ulong local_c8;
  undefined8 uStack_c0;
  undefined8 local_b8;
  undefined8 uStack_b0;
  undefined8 local_a8;
  undefined8 uStack_a0;
  undefined8 local_98;
  undefined8 uStack_90;
  undefined8 local_88;
  undefined8 uStack_80;
  long local_78;
  
  local_78 = *(long *)PTR____stack_chk_guard_1007c41d0;
  if (((((*(ulong *)(param_1 + 0x40) ^ *(ulong *)(param_1 + 0x38)) == 0xffffffffffffffff) &&
       ((*(ulong *)(param_1 + 0x48) == param_5 && *(ulong *)(param_1 + 0x38) == param_2) &&
        (*(ulong *)(param_1 + 0x50) ^ *(ulong *)(param_1 + 0x48)) == 0xffffffffffffffff)) &&
      (*(long *)(param_1 + 0x60) != 0)) && (*(long *)(param_1 + 0x68) != 0)) {
    __ZNSt3__15mutex4lockEv(&DAT_100818170);
    iVar7 = FUN_1001f3a2c(param_1,param_3,param_4);
    __ZNSt3__15mutex6unlockEv(&DAT_100818170);
    if (iVar7 != 0) {
      uVar8 = FUN_1001f430c(&local_2c0);
      if ((int)uVar8 == 0) goto LAB_1001f4a4c;
      if (local_2c0 == *(ulong *)(param_1 + 0x58)) {
        FUN_1001f2b50(local_2d8);
        uVar8 = FUN_1001f2aa8();
        __ZNSt3__15mutex4lockEv(&DAT_100818170);
        if ((DAT_10081d968 == '\x01') && ((local_2d8[0] & 1) != 0)) {
          _memcpy(auStack_2b8,&DAT_10081da00,0x148);
          __ZNSt3__15mutex6unlockEv(&DAT_100818170);
          uStack_80 = 0;
          local_88 = 0;
          uStack_90 = 0;
          local_98 = 0;
          uStack_a0 = 0;
          local_a8 = 0;
          uStack_c0 = 0;
          uStack_b0 = 0;
          local_b8 = 0;
          uStack_e0 = 0;
          local_e8 = 0;
          uStack_f0 = uVar8 & 0xffffffff;
          local_f8 = local_2d0;
          uVar8 = (DAT_100818270 >> 0x35 | DAT_100818270 << 0xb) ^
                  (DAT_1008181d0 >> 0x19 | DAT_1008181d0 << 0x27) ^ DAT_100818310;
          uVar8 = local_2d0 ^ (uVar8 >> 0x2d | uVar8 << 0x13);
          uVar8 = (uVar8 ^ uVar8 >> 0x1e) * -0x40a7b892e31b1a47;
          local_d8 = (uVar8 ^ uVar8 >> 0x1b) * -0x6b2fb644ecceee15;
          local_d8 = local_d8 ^ local_d8 >> 0x1f;
          uVar8 = local_d8 ^ (local_2d0 >> 7 | local_2d0 << 0x39);
          uVar8 = (uVar8 ^ uVar8 >> 0x1e) * -0x40a7b892e31b1a47;
          uStack_d0 = (uVar8 ^ uVar8 >> 0x1b) * -0x6b2fb644ecceee15;
          uStack_d0 = uStack_d0 ^ uStack_d0 >> 0x1f;
          local_c8 = uStack_d0 ^ local_d8;
          FUN_1001f5228(&local_150,&local_f8);
          FUN_1001f621c(&local_120,&local_f8);
          uVar6 = (uint)local_108;
          uVar5 = (uint)local_110;
          uVar4 = (uint)local_120;
          uVar1 = (uint)local_150;
          uVar2 = (uint)local_140;
          uVar3 = (uint)local_138;
          local_b8 = 0;
          uStack_b0 = 0;
          local_f8 = 0x74e1b93c5a260fd8;
          uStack_c0 = 0;
          local_e8 = local_2b0;
          uVar8 = (DAT_100818270 >> 0x35 | DAT_100818270 << 0xb) ^
                  (DAT_1008181d0 >> 0x19 | DAT_1008181d0 << 0x27) ^ DAT_100818310;
          uVar8 = (uVar8 >> 0x2d | uVar8 << 0x13) ^ 0xced9862fe486084b;
          uVar8 = (uVar8 ^ uVar8 >> 0x1e) * -0x40a7b892e31b1a47;
          uVar10 = (uVar8 ^ uVar8 >> 0x1b) * -0x6b2fb644ecceee15;
          uVar8 = (DAT_1008182a0 >> 0x27 | DAT_1008182a0 << 0x19) ^
                  (DAT_100818200 >> 0x2f | DAT_100818200 << 0x11) ^ DAT_100818340;
          uVar8 = (uVar8 >> 0x2d | uVar8 << 0x13) ^ 0xfa44f402f6c078a5;
          uVar8 = (uVar8 ^ uVar8 >> 0x1e) * -0x40a7b892e31b1a47;
          uVar11 = (uVar8 ^ uVar8 >> 0x1b) * -0x6b2fb644ecceee15;
          uVar12 = local_148 ^ uVar10 >> 0x1f;
          uVar13 = uStack_118 ^ uVar11 >> 0x1f;
          local_d8 = uStack_248;
          uStack_e0 = local_250;
          local_c8 = uStack_238;
          uStack_d0 = local_240;
          uStack_118 = 0;
          local_120 = 0;
          local_108 = 0;
          local_110 = 0;
          uStack_f0 = param_5;
          uVar8 = FUN_10021b894(auStack_230,&local_f8,0x38,&local_120);
          if ((uVar8 & 1) == 0) {
            FUN_10021ca70(auStack_2b8);
          }
          else {
            local_130 = 0;
            uStack_128 = 0;
            uVar8 = (DAT_1008181d0 >> 0x19 | DAT_1008181d0 << 0x27) ^
                    (DAT_100818270 >> 0x35 | DAT_100818270 << 0xb) ^
                    DAT_100818310 ^ param_5 ^ 0x78d32ffc5f5225b5;
            uVar8 = (uVar8 ^ uVar8 >> 0x1e) * -0x40a7b892e31b1a47;
            local_138 = (uVar8 ^ uVar8 >> 0x1b) * -0x6b2fb644ecceee15;
            local_138 = local_138 ^ local_138 >> 0x1f;
            local_150 = 0xb4e76c2198d35af0;
            local_140 = local_2d0;
            local_170[1] = 0;
            local_170[0] = 0;
            local_170[3] = 0;
            local_170[2] = 0;
            local_148 = param_5;
            uVar9 = FUN_10021b894(auStack_230,&local_150,0x20,local_170);
            uVar8 = local_120;
            if ((uVar9 & 1) == 0) {
              FUN_10021ca70(auStack_2b8);
            }
            else {
              uVar11 = (ulong)((uVar13 ^ uVar11) == 0xd33c03aa1a4fe17b &&
                              (uVar12 ^ uVar10) == 0x7fa468dca5dda150) &
                       (ulong)(uVar1 & uVar4 & uVar2 & uVar5 & uVar3 & uVar6);
              uVar10 = local_170[0];
              if (uVar11 != 0) {
                uVar10 = 0;
              }
              FUN_10021ca70(auStack_2b8);
              uVar10 = uVar10 | uVar8 & -uVar11;
              if (uVar10 != 0) {
                uVar8 = param_2 ^ (param_5 >> 0x2f | param_5 << 0x11) ^ local_2c0 ^
                        0x3d92f6a871bc405e ^ uVar10;
                uVar8 = (uVar8 ^ uVar8 >> 0x1e) * -0x40a7b892e31b1a47;
                uVar8 = (uVar8 ^ uVar8 >> 0x1b) * -0x6b2fb644ecceee15;
                uVar11 = FUN_1001f3bec(param_1,uVar8 ^ uVar8 >> 0x1f);
                uVar8 = (param_2 >> 0x39 | param_2 << 7) ^ (local_2c0 >> 0x29 | local_2c0 << 0x17) ^
                        (uVar10 >> 0x23 | uVar10 << 0x1d) ^ param_5 ^ 0xe4b1792c650ad83f ^ uVar11;
                uVar8 = (uVar8 ^ uVar8 >> 0x1e) * -0x40a7b892e31b1a47;
                uVar8 = (uVar8 ^ uVar8 >> 0x1b) * -0x6b2fb644ecceee15;
                uVar10 = FUN_1001f3bec(param_1,uVar8 ^ uVar8 >> 0x1f);
                uVar8 = 0;
                if ((uVar11 != 0) &&
                   ((uVar10 != 0 && uVar11 == *(ulong *)(param_1 + 0x60)) &&
                    uVar10 == *(ulong *)(param_1 + 0x68))) {
                  iVar7 = FUN_1001f2928(param_2 ^ (param_5 >> 0x35 | param_5 << 0xb) ^
                                        0x91c4e7a25bd8306f ^ uVar10);
                  uVar8 = (ulong)(iVar7 == 0);
                }
                goto LAB_1001f4a4c;
              }
            }
          }
        }
        else {
          __ZNSt3__15mutex6unlockEv(&DAT_100818170);
        }
      }
    }
  }
  uVar8 = 0;
LAB_1001f4a4c:
  if (*(long *)PTR____stack_chk_guard_1007c41d0 == local_78) {
    return;
  }
                    /* WARNING: Subroutine does not return */
  ___stack_chk_fail(uVar8);
}

