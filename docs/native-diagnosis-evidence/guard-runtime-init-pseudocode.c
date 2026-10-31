
undefined8 FUN_1001f34a8(void)

{
  uint uVar1;
  int iVar2;
  long lVar3;
  long lVar4;
  undefined8 uVar5;
  size_t local_2d8;
  undefined1 local_2d0 [8];
  ulong local_2c8;
  long lStack_2c0;
  uint local_2b0;
  int local_48 [3];
  pid_t local_3c;
  long local_38;
  
  local_38 = *(long *)PTR____stack_chk_guard_1007c41d0;
  local_48[0] = 1;
  local_48[1] = 0xe;
  local_48[2] = 1;
  local_3c = _getpid();
  _bzero(local_2d0,0x288);
  local_2d8 = 0x288;
  iVar2 = _sysctl(local_48,4,local_2d0,&local_2d8,(void *)0x0,0);
  uVar1 = 0;
  if (iVar2 == 0) {
    uVar1 = local_2b0 >> 0xb & 1;
  }
  lVar3 = __ZNSt3__16chrono12system_clock3nowEv();
  lVar4 = __ZNSt3__16chrono12steady_clock3nowEv();
  lStack_2c0 = lVar4 / 1000000000;
  if (lVar4 < -999999999) {
    lStack_2c0 = 0;
  }
  local_2d0[0] = -1000000000 < lVar4 && 999999 < lVar3;
  local_2c8 = lVar3 / 1000000 & (lVar3 / 1000000 >> 0x3f ^ 0xffffffffffffffffU);
  __ZNSt3__15mutex4lockEv(&DAT_100818170);
  uVar5 = FUN_1001f2be8(0x726561646261636b,local_2d0,uVar1,1);
  __ZNSt3__15mutex6unlockEv(&DAT_100818170);
  if (*(long *)PTR____stack_chk_guard_1007c41d0 == local_38) {
    return uVar5;
  }
                    /* WARNING: Subroutine does not return */
  ___stack_chk_fail();
}

