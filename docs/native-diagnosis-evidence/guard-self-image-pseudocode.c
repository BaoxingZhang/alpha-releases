
void FUN_100266d98(undefined8 *param_1)

{
  long lVar1;
  long lVar2;
  long lVar3;
  long lVar4;
  int iVar5;
  long lVar6;
  long lVar7;
  undefined8 uVar8;
  long local_130;
  long lStack_128;
  undefined8 local_120;
  undefined8 uStack_118;
  undefined8 uStack_110;
  undefined8 uStack_108;
  undefined8 local_100;
  undefined8 uStack_f8;
  undefined8 local_f0;
  undefined8 uStack_e8;
  undefined8 local_e0;
  undefined8 uStack_d8;
  undefined8 local_d0;
  long local_c8;
  long lStack_c0;
  undefined8 local_b8;
  undefined8 uStack_b0;
  undefined8 local_a8;
  undefined8 uStack_a0;
  undefined8 uStack_98;
  undefined8 uStack_90;
  undefined8 local_88;
  undefined8 uStack_80;
  undefined8 uStack_78;
  undefined8 uStack_70;
  undefined8 local_68;
  
  std[9bc579fd67db55b0]::env::current_exe(&local_c8);
  lVar4 = lStack_c0;
  lVar3 = local_c8;
  if (local_c8 == -1) {
    uVar8 = FUN_10061a3c4(lStack_c0);
    *param_1 = 1;
    param_1[1] = uVar8;
    return;
  }
  std[9bc579fd67db55b0]::sys::fs::canonicalize(&local_130,lStack_c0,local_b8);
  uVar8 = local_120;
  lVar2 = lStack_128;
  lVar1 = local_130;
  if (local_130 == -1) {
    uVar8 = FUN_10061a3c4(lStack_128);
    *param_1 = 1;
    param_1[1] = uVar8;
    lVar1 = lVar3;
    lVar2 = lVar4;
    goto joined_r0x000100266f1c;
  }
  if (lVar3 != 0) {
    __rustc[3d2f79520d6fa809]::__rust_dealloc(lVar4,lVar3,1);
  }
  <std[9bc579fd67db55b0]::path::Path>::_with_file_name
            (&local_c8,lVar2,uVar8,"peer-manifest.json",0x12);
  lVar3 = lStack_c0;
  std[9bc579fd67db55b0]::fs::read::inner(&local_130,lStack_c0,local_b8);
  if (local_c8 != 0) {
    __rustc[3d2f79520d6fa809]::__rust_dealloc(lVar3,local_c8,1);
  }
  lVar4 = lStack_128;
  lVar3 = local_130;
  if (local_130 == -1) {
    uVar8 = FUN_100619c2c(lStack_128);
    *param_1 = 1;
    param_1[1] = uVar8;
    goto joined_r0x000100266f1c;
  }
  FUN_1002670b8(&local_c8,lStack_128,local_120);
  if (local_c8 == -1) {
    *param_1 = 1;
    param_1[1] = lStack_c0;
  }
  else {
    uStack_e8 = uStack_80;
    local_f0 = local_88;
    uStack_d8 = uStack_70;
    local_e0 = uStack_78;
    uStack_118 = uStack_b0;
    local_120 = local_b8;
    uStack_108 = uStack_a0;
    uStack_110 = local_a8;
    local_d0 = local_68;
    uStack_f8 = uStack_90;
    local_100 = uStack_98;
    local_130 = local_c8;
    lStack_128 = lStack_c0;
    FUN_1002719c4(&local_c8);
    lVar7 = lStack_c0;
    lVar6 = local_c8;
    if (local_c8 == -1) {
      *param_1 = 1;
      param_1[1] = lStack_c0;
    }
    else {
      FUN_100268f2c(&local_c8,lStack_c0,local_b8,local_e0,uStack_d8);
      iVar5 = (int)local_c8;
      if ((int)local_c8 != -1) {
        if (*(long *)(lStack_c0 + 0x48) == 0) {
          local_c8 = 0;
          local_b8 = 0;
        }
        else {
          if (*(long *)(lStack_c0 + 0x38) == 0) {
                    /* WARNING: Subroutine does not return */
            core[2525d0a98ae2f2bb]::option::unwrap_failed
                      (&PTR_s__rustc_58cf8f9c35b355199727627d0_1007d20d8);
          }
          FUN_10026f928(&local_c8,*(long *)(lStack_c0 + 0x38),*(undefined8 *)(lStack_c0 + 0x40));
        }
        param_1[2] = lStack_c0;
        param_1[1] = local_c8;
        param_1[3] = local_b8;
        param_1[4] = local_d0;
        *param_1 = 0;
        _close(iVar5);
        if (lVar6 != 0) {
          __rustc[3d2f79520d6fa809]::__rust_dealloc(lVar7,lVar6,1);
        }
        FUN_100265b94(&local_130);
        goto LAB_100266fbc;
      }
      *param_1 = 1;
      param_1[1] = lStack_c0;
      if (lVar6 != 0) {
        __rustc[3d2f79520d6fa809]::__rust_dealloc(lVar7,lVar6,1);
      }
    }
    FUN_100265b94(&local_130);
  }
LAB_100266fbc:
  if (lVar3 != 0) {
    __rustc[3d2f79520d6fa809]::__rust_dealloc(lVar4,lVar3,1);
  }
joined_r0x000100266f1c:
  if (lVar1 != 0) {
    __rustc[3d2f79520d6fa809]::__rust_dealloc(lVar2,lVar1,1);
  }
  return;
}

