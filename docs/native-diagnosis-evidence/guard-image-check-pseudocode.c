
bool FUN_10021939c(undefined8 param_1,long *param_2)

{
  size_t sVar1;
  size_t sVar2;
  undefined8 *******pppppppuVar3;
  undefined8 *puVar4;
  bool bVar5;
  int iVar6;
  long local_d0;
  long lStack_c8;
  undefined8 ******local_c0;
  size_t sStack_b8;
  ulong uStack_b0;
  undefined8 local_a8;
  undefined8 local_a0;
  long lStack_98;
  long local_90;
  long local_88;
  undefined8 local_80;
  long lStack_78;
  long local_70;
  undefined8 uStack_68;
  undefined1 local_60;
  long local_50;
  long lStack_48;
  long local_40;
  long lStack_38;
  long local_28;
  
  local_28 = *(long *)PTR____stack_chk_guard_1007c41d0;
  if (DAT_10081dbb8 != '\x01') {
    if (*(long *)PTR____stack_chk_guard_1007c41d0 == local_28) {
      return false;
    }
    goto LAB_1002194e8;
  }
  local_60 = 0;
  lStack_78 = 0;
  local_80 = 0;
  uStack_68 = 0;
  local_70 = 0;
  lStack_98 = 0;
  local_a0 = 0;
  local_88 = 0;
  local_90 = 0;
  sStack_b8 = 0;
  local_c0 = (undefined8 *******)0x0;
  local_a8 = 0;
  uStack_b0 = 0;
  lStack_c8 = 0;
  local_d0 = 0;
  iVar6 = FUN_100217de8(param_1,&local_d0);
  if (((iVar6 == 0) || (local_d0 != DAT_10081db48)) || (lStack_c8 != DAT_10081db50)) {
LAB_1002194ec:
    bVar5 = false;
  }
  else {
    sVar1 = sStack_b8;
    if (-1 < (long)uStack_b0) {
      sVar1 = uStack_b0 >> 0x38;
    }
    sVar2 = DAT_10081db60;
    if (-1 < (char)DAT_10081db68._7_1_) {
      sVar2 = (ulong)DAT_10081db68._7_1_;
    }
    if (sVar1 != sVar2) goto LAB_1002194ec;
    pppppppuVar3 = (undefined8 *******)local_c0;
    if (-1 < (long)uStack_b0) {
      pppppppuVar3 = &local_c0;
    }
    puVar4 = DAT_10081db58;
    if (-1 < (char)DAT_10081db68._7_1_) {
      puVar4 = &DAT_10081db58;
    }
    iVar6 = _memcmp(pppppppuVar3,puVar4,sVar1);
    if (iVar6 != 0) goto LAB_1002194ec;
    lStack_48 = 0;
    local_50 = 0;
    lStack_38 = 0;
    local_40 = 0;
    iVar6 = FUN_100217f70(&DAT_10081db48,0,&local_50);
    if (iVar6 == 0) goto LAB_1002194ec;
    bVar5 = ((local_50 == *param_2 && lStack_48 == param_2[1]) && local_40 == param_2[2]) &&
            lStack_38 == param_2[3];
  }
  if (lStack_78 != 0) {
    local_70 = lStack_78;
    __ZdlPv();
  }
  if (local_90 != 0) {
    local_88 = local_90;
    __ZdlPv();
  }
  if (lStack_98 < 0) {
    __ZdlPv(local_a8);
  }
  if ((long)uStack_b0 < 0) {
    __ZdlPv(local_c0);
    if (*(long *)PTR____stack_chk_guard_1007c41d0 != local_28) goto LAB_1002194e8;
  }
  else if (*(long *)PTR____stack_chk_guard_1007c41d0 != local_28) {
LAB_1002194e8:
                    /* WARNING: Subroutine does not return */
    ___stack_chk_fail();
  }
  return bVar5;
}

