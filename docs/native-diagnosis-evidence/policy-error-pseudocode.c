
void FUN_100106ef8(void *param_1,undefined8 param_2,undefined8 param_3)

{
  long lVar1;
  undefined8 uVar2;
  int iVar3;
  undefined8 *puVar4;
  size_t sVar5;
  undefined8 uVar6;
  undefined1 auVar7 [16];
  long local_318 [12];
  long local_2b8;
  long local_2b0;
  long local_2a8;
  long *local_d0;
  undefined **ppuStack_c8;
  undefined8 *local_c0;
  undefined8 uStack_b8;
  undefined8 uStack_b0;
  undefined8 uStack_a8;
  undefined8 local_a0;
  size_t sStack_98;
  void *local_90;
  size_t sStack_88;
  long local_80;
  undefined8 uStack_78;
  undefined8 local_70;
  undefined1 uStack_61;
  
  FUN_100106bcc(local_318,param_2,"SECURITY_RUNTIME_POLICY_REJECTED",0x20,&DAT_10062cb20,8,0);
  local_80 = 0;
  uStack_78 = 1;
  local_70 = 0;
  local_c0 = (undefined8 *)0x60000020;
  local_d0 = &local_80;
  ppuStack_c8 = &PTR_FUN_1007c84e0;
  iVar3 = <anyhow[a2840084f6f02700]::Error_as_core[2525d0a98ae2f2bb]::fmt::Display>::fmt
                    (param_3,&local_d0);
  uVar2 = uStack_78;
  lVar1 = local_80;
  if (iVar3 != 0) {
                    /* WARNING: Subroutine does not return */
    core[2525d0a98ae2f2bb]::result::unwrap_failed
              ("a Display implementation returned an error unexpectedly",0x37,&uStack_61,
               &DAT_1007c8348,&PTR_s__rustc_58cf8f9c35b355199727627d0_1007c8510);
  }
  auVar7 = FUN_1000e8054(uStack_78,local_70);
  sVar5 = auVar7._8_8_;
  if ((local_318[0] != -1) && (auVar7._0_8_ != (void *)0x0)) {
    __rustc[3d2f79520d6fa809]::__rust_no_alloc_shim_is_unstable_v2();
    puVar4 = (undefined8 *)__rustc[3d2f79520d6fa809]::__rust_alloc(0xd,1);
    if (puVar4 == (undefined8 *)0x0) {
                    /* WARNING: Subroutine does not return */
      alloc[654f9ea51da0cd84]::raw_vec::handle_error(1,0xd);
    }
    *puVar4 = 0x5f656d69746e7572;
    *(char (*) [8])((long)puVar4 + 5) = (char  [8])0x64726175675f656d;
    if ((long)sVar5 < 0) {
      uVar6 = 0;
LAB_100106fdc:
                    /* WARNING: Subroutine does not return */
      alloc[654f9ea51da0cd84]::raw_vec::handle_error(uVar6,sVar5);
    }
    if (sVar5 == 0) {
      local_90 = (void *)0x1;
    }
    else {
      __rustc[3d2f79520d6fa809]::__rust_no_alloc_shim_is_unstable_v2();
      uVar6 = 1;
      local_90 = (void *)__rustc[3d2f79520d6fa809]::__rust_alloc(sVar5,1);
      if (local_90 == (void *)0x0) goto LAB_100106fdc;
      _memcpy(local_90,auVar7._0_8_,sVar5);
    }
    ppuStack_c8 = (undefined **)0xd;
    local_d0 = (long *)0x2;
    uStack_b0 = 0;
    uStack_b8 = 0xd;
    uStack_a8 = 1;
    local_a0 = 0;
    local_c0 = puVar4;
    sStack_98 = sVar5;
    sStack_88 = sVar5;
    if (local_2a8 == local_2b8) {
      <alloc[654f9ea51da0cd84]::raw_vec::RawVec<alpha_license_client[6c429acb8d7b817]::device_bound_v2::RevocationEntry>>
      ::grow_one(&local_2b8);
    }
    puVar4 = (undefined8 *)(local_2b0 + local_2a8 * 0x50);
    puVar4[9] = sStack_88;
    puVar4[8] = local_90;
    puVar4[1] = ppuStack_c8;
    *puVar4 = local_d0;
    puVar4[3] = uStack_b8;
    puVar4[2] = local_c0;
    puVar4[5] = uStack_a8;
    puVar4[4] = uStack_b0;
    puVar4[7] = sStack_98;
    puVar4[6] = local_a0;
    local_2a8 = local_2a8 + 1;
  }
  if (lVar1 != 0) {
    __rustc[3d2f79520d6fa809]::__rust_dealloc(uVar2,lVar1,1);
  }
  _memcpy(param_1,local_318,0x248);
  return;
}

