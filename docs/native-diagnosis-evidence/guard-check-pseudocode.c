
void FUN_100225c88(undefined8 param_1,undefined8 param_2,undefined8 param_3,undefined8 param_4)

{
  int iVar1;
  undefined4 uVar2;
  long lVar3;
  undefined4 *puVar4;
  ulong uVar5;
  uint uVar6;
  undefined4 extraout_w8;
  undefined8 local_b0;
  undefined8 uStack_a8;
  undefined8 local_a0;
  undefined8 uStack_98;
  undefined8 uStack_90;
  undefined8 uStack_88;
  undefined8 local_80;
  undefined8 uStack_78;
  undefined8 uStack_70;
  undefined8 uStack_68;
  undefined8 local_60;
  undefined8 uStack_58;
  undefined8 uStack_50;
  undefined8 uStack_48;
  long local_38;
  
  local_38 = *(long *)PTR____stack_chk_guard_1007c41d0;
  lVar3 = __ZNSt3__16chrono12system_clock3nowEv();
  if (lVar3 < 0x65e2631f26000) {
    puVar4 = (undefined4 *)(*(code *)PTR___tlv_bootstrap_10081d5f8)();
    uVar2 = 0xffffff96;
    *puVar4 = 0xffffff96;
  }
  else {
    uStack_58 = 0;
    local_60 = 0;
    uStack_48 = 0;
    uStack_50 = 0;
    uStack_78 = 0;
    local_80 = 0;
    uStack_68 = 0;
    uStack_70 = 0;
    uStack_98 = 0;
    local_a0 = 0;
    uStack_88 = 0;
    uStack_90 = 0;
    uStack_a8 = 0;
    local_b0 = 0;
    uVar5 = FUN_1001f3d14(param_1,param_2,param_3,param_4,&local_b0);
    if ((int)uVar5 == 0) {
      iVar1 = FUN_1001f452c(uVar5,&local_b0,param_1,param_2,param_3,param_4);
      uVar6 = 0;
      if (iVar1 == 0) {
        uVar6 = 0xffffff99;
      }
      uVar5 = (ulong)uVar6;
    }
    puVar4 = (undefined4 *)(*(code *)PTR___tlv_bootstrap_10081d5f8)(uVar5);
    *puVar4 = extraout_w8;
    uVar2 = *puVar4;
  }
  if (*(long *)PTR____stack_chk_guard_1007c41d0 == local_38) {
    return;
  }
                    /* WARNING: Subroutine does not return */
  ___stack_chk_fail(uVar2);
}

