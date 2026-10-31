
void FUN_1001f3d14(ulong param_1,undefined8 param_2,undefined8 param_3,ulong param_4,
                  undefined8 *param_5)

{
  uint uVar1;
  uint uVar2;
  uint uVar3;
  uint uVar4;
  uint uVar5;
  uint uVar6;
  int iVar7;
  pid_t pVar8;
  undefined8 uVar9;
  long lVar10;
  long lVar11;
  ulong uVar12;
  ulong uVar13;
  ulong uVar14;
  ulong uVar15;
  ulong uVar16;
  ulong uVar17;
  ulong local_430;
  undefined8 local_428;
  undefined8 uStack_420;
  undefined8 local_418;
  undefined8 uStack_410;
  undefined8 local_408;
  undefined8 uStack_400;
  undefined8 local_3f8;
  ulong local_3f0 [4];
  size_t local_3d0;
  ulong local_3c8;
  ulong local_3c0;
  ulong local_3b8;
  undefined8 local_3b0;
  undefined8 uStack_3a8;
  ulong local_3a0;
  ulong uStack_398;
  undefined8 local_390;
  undefined8 local_388;
  ulong local_380;
  undefined8 local_378;
  undefined8 local_370;
  undefined8 uStack_368;
  ulong local_360;
  ulong uStack_358;
  ulong local_350;
  undefined8 local_348;
  undefined8 local_340;
  undefined8 uStack_338;
  undefined8 uStack_330;
  undefined8 uStack_328;
  undefined8 local_320;
  undefined8 uStack_318;
  undefined8 uStack_310;
  undefined8 uStack_308;
  undefined1 auStack_300 [8];
  undefined8 local_2f8;
  uint local_2e0;
  undefined8 local_298;
  undefined8 uStack_290;
  undefined8 local_288;
  undefined8 uStack_280;
  undefined1 auStack_278 [512];
  long local_78;
  
  local_78 = *(long *)PTR____stack_chk_guard_1007c41d0;
  param_5[0xb] = 0;
  param_5[10] = 0;
  param_5[0xd] = 0;
  param_5[0xc] = 0;
  param_5[7] = 0;
  param_5[6] = 0;
  param_5[9] = 0;
  param_5[8] = 0;
  param_5[3] = 0;
  param_5[2] = 0;
  param_5[5] = 0;
  param_5[4] = 0;
  param_5[1] = 0;
  *param_5 = 0;
  uVar9 = FUN_1001f2928(*(ulong *)(&DAT_10063cc10 + ((ulong)((uint)param_4 ^ (uint)param_1) & 3) * 8
                                  ) ^ (param_4 >> 0x2d | param_4 << 0x13) ^
                        param_1 ^ 0x4f1d8a73c6b250e9);
  if (((int)uVar9 == 0) &&
     (uVar9 = FUN_1001f3628(param_1 ^ (param_4 >> 0x21 | param_4 << 0x1f) ^ 0xb7e25a419c603fd8,
                            param_2,param_3,&local_428), (int)uVar9 == 0)) {
    __ZNSt3__15mutex4lockEv(&DAT_100818170);
    iVar7 = FUN_1001f3a2c(&local_428,param_2,param_3);
    __ZNSt3__15mutex6unlockEv(&DAT_100818170);
    if ((iVar7 != 0) && (iVar7 = FUN_1001f430c(&local_430), iVar7 != 0)) {
      lVar10 = __ZNSt3__16chrono12system_clock3nowEv();
      lVar11 = __ZNSt3__16chrono12steady_clock3nowEv();
      local_380 = 0xe00000001;
      local_378 = CONCAT44(local_378._4_4_,1);
      pVar8 = _getpid();
      local_378 = CONCAT44(pVar8,(undefined4)local_378);
      _bzero(auStack_300,0x288);
      local_3d0 = 0x288;
      iVar7 = _sysctl((int *)&local_380,4,auStack_300,&local_3d0,(void *)0x0,0);
      __ZNSt3__15mutex4lockEv(&DAT_100818170);
      if ((DAT_10081d968 & (999999 < lVar10 && -1000000000 < lVar11)) == 0) {
        __ZNSt3__15mutex6unlockEv(&DAT_100818170);
      }
      else {
        uVar17 = lVar10 / 1000000 & (lVar10 / 1000000 >> 0x3f ^ 0xffffffffffffffffU);
        uVar1 = 0;
        if (iVar7 == 0) {
          uVar1 = local_2e0 >> 0xb & 1;
        }
        _memcpy(auStack_300,&DAT_10081da00,0x148);
        __ZNSt3__15mutex6unlockEv(&DAT_100818170);
        uStack_318 = 0;
        local_320 = 0;
        uStack_308 = 0;
        uStack_310 = 0;
        uStack_338 = 0;
        local_340 = 0;
        uStack_328 = 0;
        uStack_330 = 0;
        local_348 = 0;
        uStack_368 = 0;
        local_370 = 0;
        uVar12 = (DAT_100818268 >> 2 | DAT_100818268 << 0x3e) ^
                 (DAT_1008181c8 >> 0x20 | DAT_1008181c8 << 0x20) ^ DAT_100818308;
        uVar12 = uVar17 ^ (uVar12 >> 0x2d | uVar12 << 0x13);
        uVar12 = (uVar12 ^ uVar12 >> 0x1e) * -0x40a7b892e31b1a47;
        local_360 = (uVar12 ^ uVar12 >> 0x1b) * -0x6b2fb644ecceee15;
        local_360 = local_360 ^ local_360 >> 0x1f;
        uVar12 = local_360 ^ (uVar17 >> 7 | uVar17 << 0x39);
        uVar12 = (uVar12 ^ uVar12 >> 0x1e) * -0x40a7b892e31b1a47;
        uStack_358 = (uVar12 ^ uVar12 >> 0x1b) * -0x6b2fb644ecceee15;
        uStack_358 = uStack_358 ^ uStack_358 >> 0x1f;
        local_350 = uStack_358 ^ local_360;
        local_380 = uVar17;
        local_378 = (ulong)uVar1;
        FUN_10020a248(&local_3d0,&local_380);
        FUN_10020b23c(&local_3a0,&local_380);
        uVar6 = (uint)local_388;
        uVar5 = (uint)local_390;
        uVar4 = (uint)local_3a0;
        uVar1 = (uint)local_3d0;
        uVar2 = (uint)local_3c0;
        uVar3 = (uint)local_3b8;
        local_340 = 0;
        uStack_338 = 0;
        local_380 = 0x74e1b93c5a260fd8;
        local_348 = 0;
        local_370 = local_2f8;
        uVar12 = (DAT_100818268 >> 2 | DAT_100818268 << 0x3e) ^
                 (DAT_1008181c8 >> 0x20 | DAT_1008181c8 << 0x20) ^ DAT_100818308;
        uVar12 = (uVar12 >> 0x2d | uVar12 << 0x13) ^ 0x72479e8cb6d1a03c;
        uVar12 = (uVar12 ^ uVar12 >> 0x1e) * -0x40a7b892e31b1a47;
        uVar13 = (uVar12 ^ uVar12 >> 0x1b) * -0x6b2fb644ecceee15;
        uVar12 = (DAT_100818298 >> 0x34 | DAT_100818298 << 0xc) ^
                 (DAT_1008181f8 >> 0x36 | DAT_1008181f8 << 10) ^ DAT_100818338;
        uVar12 = (uVar12 >> 0x2d | uVar12 << 0x13) ^ 0x9db30c5fc90c1096;
        uVar12 = (uVar12 ^ uVar12 >> 0x1e) * -0x40a7b892e31b1a47;
        uVar14 = (uVar12 ^ uVar12 >> 0x1b) * -0x6b2fb644ecceee15;
        uVar15 = local_3c8 ^ uVar13 >> 0x1f;
        uVar16 = uStack_398 ^ uVar14 >> 0x1f;
        local_360 = uStack_290;
        uStack_368 = local_298;
        local_350 = uStack_280;
        uStack_358 = local_288;
        uStack_398 = 0;
        local_3a0 = 0;
        local_388 = 0;
        local_390 = 0;
        local_378 = param_4;
        uVar12 = FUN_10021b894(auStack_278,&local_380,0x38,&local_3a0);
        if ((uVar12 & 1) == 0) {
          FUN_10021ca70(auStack_300);
        }
        else {
          local_3b0 = 0;
          uStack_3a8 = 0;
          uVar12 = (DAT_1008181c8 >> 0x20 | DAT_1008181c8 << 0x20) ^
                   (DAT_100818268 >> 2 | DAT_100818268 << 0x3e) ^
                   DAT_100818308 ^ param_4 ^ 0x5627a333a9607d9f;
          uVar12 = (uVar12 ^ uVar12 >> 0x1e) * -0x40a7b892e31b1a47;
          local_3b8 = (uVar12 ^ uVar12 >> 0x1b) * -0x6b2fb644ecceee15;
          local_3b8 = local_3b8 ^ local_3b8 >> 0x1f;
          local_3d0 = 0x6ad13f82c507e49b;
          local_3f0[1] = 0;
          local_3f0[0] = 0;
          local_3f0[3] = 0;
          local_3f0[2] = 0;
          local_3c8 = param_4;
          local_3c0 = uVar17;
          uVar12 = FUN_10021b894(auStack_278,&local_3d0,0x20,local_3f0);
          uVar17 = local_3a0;
          if ((uVar12 & 1) == 0) {
            FUN_10021ca70(auStack_300);
          }
          else {
            uVar13 = (ulong)((uVar16 ^ uVar14) == 0xd18848c5a82638a7 &&
                            (uVar15 ^ uVar13) == 0x5239b33a9596864e) &
                     (ulong)(uVar1 & uVar4 & uVar2 & uVar5 & uVar3 & uVar6);
            uVar12 = local_3f0[0];
            if (uVar13 != 0) {
              uVar12 = 0;
            }
            FUN_10021ca70(auStack_300);
            uVar12 = uVar12 | uVar17 & -uVar13;
            if (uVar12 != 0) {
              uVar17 = param_1 ^ (param_4 >> 0x2f | param_4 << 0x11) ^ local_430 ^
                       0x3d92f6a871bc405e ^ uVar12;
              uVar17 = (uVar17 ^ uVar17 >> 0x1e) * -0x40a7b892e31b1a47;
              uVar17 = (uVar17 ^ uVar17 >> 0x1b) * -0x6b2fb644ecceee15;
              uVar17 = FUN_1001f3bec(&local_428,uVar17 ^ uVar17 >> 0x1f);
              uVar12 = (param_1 >> 0x39 | param_1 << 7) ^ (uVar12 >> 0x23 | uVar12 << 0x1d) ^
                       (local_430 >> 0x29 | local_430 << 0x17) ^ param_4 ^ 0xe4b1792c650ad83f ^
                       uVar17;
              uVar12 = (uVar12 ^ uVar12 >> 0x1e) * -0x40a7b892e31b1a47;
              uVar12 = (uVar12 ^ uVar12 >> 0x1b) * -0x6b2fb644ecceee15;
              lVar10 = FUN_1001f3bec(&local_428,uVar12 ^ uVar12 >> 0x1f);
              uVar9 = 0xffffff99;
              if ((uVar17 != 0) && (lVar10 != 0)) {
                uVar9 = 0;
                param_5[1] = uStack_420;
                *param_5 = local_428;
                param_5[3] = uStack_410;
                param_5[2] = local_418;
                param_5[5] = uStack_400;
                param_5[4] = local_408;
                param_5[6] = local_3f8;
                param_5[7] = param_1;
                param_5[8] = ~param_1;
                param_5[9] = param_4;
                param_5[10] = ~param_4;
                param_5[0xb] = local_430;
                param_5[0xc] = uVar17;
                param_5[0xd] = lVar10;
              }
              goto LAB_1001f42b4;
            }
          }
        }
      }
    }
    uVar9 = 0xffffff99;
  }
LAB_1001f42b4:
  if (*(long *)PTR____stack_chk_guard_1007c41d0 == local_78) {
    return;
  }
                    /* WARNING: Subroutine does not return */
  ___stack_chk_fail(uVar9);
}

