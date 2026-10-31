
undefined8 FUN_1001f3628(ulong param_1,undefined8 param_2,undefined8 param_3,undefined8 *param_4)

{
  uint uVar1;
  pid_t pVar2;
  int iVar3;
  long lVar4;
  long lVar5;
  undefined8 uVar6;
  size_t local_300;
  bool local_2f8 [8];
  undefined8 local_2f0;
  long lStack_2e8;
  undefined8 local_2e0;
  undefined8 uStack_2d8;
  undefined8 uStack_2d0;
  undefined8 uStack_2c8;
  uint local_2c0;
  undefined4 uStack_2bc;
  undefined8 uStack_2b8;
  undefined8 local_2b0;
  long local_58;
  
  local_58 = *(long *)PTR____stack_chk_guard_1007c41d0;
  param_4[6] = 0;
  param_4[3] = 0;
  param_4[2] = 0;
  param_4[5] = 0;
  param_4[4] = 0;
  param_4[1] = 0;
  *param_4 = 0;
  local_2f8[0] = true;
  local_2f8[1] = false;
  local_2f8[2] = false;
  local_2f8[3] = false;
  local_2f8[4] = true;
  local_2f8[5] = false;
  local_2f8[6] = false;
  local_2f8[7] = false;
  local_2f0 = CONCAT44(local_2f0._4_4_,1);
  pVar2 = _getpid();
  local_2f0 = CONCAT44(pVar2,(undefined4)local_2f0);
  _bzero(&local_2e0,0x288);
  local_300 = 0x288;
  iVar3 = _sysctl((int *)local_2f8,4,&local_2e0,&local_300,(void *)0x0,0);
  uVar1 = 0;
  if (iVar3 == 0) {
    uVar1 = local_2c0 >> 0xb & 1;
  }
  lVar4 = __ZNSt3__16chrono12system_clock3nowEv();
  lVar5 = __ZNSt3__16chrono12steady_clock3nowEv();
  lStack_2e8 = lVar5 / 1000000000;
  if (lVar5 < -999999999) {
    lStack_2e8 = 0;
  }
  local_2f8[0] = -1000000000 < lVar5 && 999999 < lVar4;
  local_2f0 = lVar4 / 1000000 & (lVar4 / 1000000 >> 0x3f ^ 0xffffffffffffffffU);
  __ZNSt3__15mutex4lockEv(&DAT_100818170);
  uVar6 = FUN_1001f2be8(*(ulong *)(&DAT_10063cc10 + ((ulong)((uint)param_3 ^ (uint)param_1) & 3) * 8
                                  ) ^ param_1,local_2f8,uVar1,0);
  if ((((((int)uVar6 == 0) && (DAT_10081d96b == '\x01')) &&
       (iVar3 = FUN_10021ca88(&DAT_10081da00), iVar3 != 0)) &&
      (((DAT_10081d998 ^ DAT_10081d9e0) == 0xffffffffffffffff &&
       ((DAT_10081d9a0 ^ DAT_10081d9e8) == 0xffffffffffffffff)))) &&
     (((DAT_10081d9a8 ^ DAT_10081d9f0) == 0xffffffffffffffff &&
      (((DAT_10081d9e8 != 0 || DAT_10081d9e0 != 0) || (DAT_10081d9f0 != 0 || DAT_10081d9f8 != 0) &&
       ((DAT_10081d9b0 ^ DAT_10081d9f8) == 0xffffffffffffffff)))))) {
    FUN_1001f38ac(&local_2e0,param_2,param_3);
    param_4[1] = uStack_2d8;
    *param_4 = local_2e0;
    param_4[3] = uStack_2c8;
    param_4[2] = uStack_2d0;
    param_4[5] = uStack_2b8;
    param_4[4] = CONCAT44(uStack_2bc,local_2c0);
    param_4[6] = local_2b0;
  }
  __ZNSt3__15mutex6unlockEv(&DAT_100818170);
  if (*(long *)PTR____stack_chk_guard_1007c41d0 == local_58) {
    return uVar6;
  }
                    /* WARNING: Subroutine does not return */
  ___stack_chk_fail();
}

