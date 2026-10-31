
void FUN_1002140c4(void *param_1,size_t param_2,undefined8 *param_3)

{
  size_t sVar1;
  int iVar2;
  ulong uVar3;
  void *pvVar4;
  void *pvVar5;
  undefined8 *puVar6;
  ulong uVar7;
  size_t sVar8;
  ulong uVar9;
  char *pcVar10;
  char *pcVar11;
  ulong uVar12;
  ulong uVar13;
  char *pcVar14;
  undefined8 uVar15;
  undefined8 uVar16;
  undefined8 uVar17;
  undefined8 uVar18;
  undefined8 uVar19;
  undefined8 uVar20;
  undefined8 uVar21;
  undefined8 local_e8;
  undefined8 uStack_e0;
  undefined8 local_d8;
  char local_d0 [32];
  undefined8 local_b0;
  undefined8 uStack_a8;
  undefined8 local_a0;
  undefined8 local_98;
  undefined8 local_90;
  undefined8 uStack_88;
  undefined8 local_80;
  undefined8 local_78;
  long local_68;
  
  local_68 = *(long *)PTR____stack_chk_guard_1007c41d0;
  if (param_2 - 0x401 < 0xfffffffffffffc00) {
    uVar3 = 0;
    if (*(long *)PTR____stack_chk_guard_1007c41d0 == local_68) {
      return;
    }
    goto LAB_10021411c;
  }
  uStack_88 = 0;
  local_90 = 0;
  local_78 = 0;
  local_80 = 0;
  uVar3 = FUN_100213d50(&local_90);
  if ((int)uVar3 != 0) {
    uStack_a8 = 0;
    local_b0 = 0;
    local_98 = 0;
    local_a0 = 0;
    builtin_strncpy(local_d0,"alpha.guard.state.secretbox.v1",0x1f);
    iVar2 = FUN_10021b894(&local_90,local_d0,0x1e,&local_b0);
    uVar3 = 0;
    local_90 = 0;
    uStack_88 = 0;
    local_80 = 0;
    local_78 = 0;
    if (iVar2 != 0) {
      uStack_88 = uStack_a8;
      local_90 = local_b0;
      local_78 = local_98;
      local_80 = local_a0;
      local_b0 = 0;
      uStack_a8 = 0;
      local_a0 = 0;
      local_98 = 0;
      local_e8 = 0;
      uStack_e0 = 0;
      local_d8 = 0;
      iVar2 = _SecRandomCopyBytes(*(undefined8 *)PTR__kSecRandomDefault_1007c4108,0x18,&local_e8);
      if (iVar2 == 0) {
        sVar1 = param_2 + 0x20;
        pvVar4 = (void *)__Znwm(sVar1);
        _bzero(pvVar4,sVar1);
        pvVar5 = (void *)__Znwm(sVar1);
        _bzero(pvVar5,sVar1);
        _memcpy((void *)((long)pvVar4 + 0x20),param_1,param_2);
        iVar2 = _crypto_secretbox_xsalsa20poly1305_tweet(pvVar5,pvVar4,sVar1,&local_e8,&local_90);
        sVar8 = 0;
        local_90 = 0;
        uStack_88 = 0;
        local_80 = 0;
        local_78 = 0;
        do {
          *(undefined1 *)((long)pvVar4 + sVar8) = 0;
          sVar8 = sVar8 + 1;
        } while (sVar1 != sVar8);
        uVar3 = (ulong)(iVar2 == 0);
        if (iVar2 == 0) {
          uVar9 = param_3[2];
          puVar6 = (undefined8 *)*param_3;
          if (uVar9 - (long)puVar6 < 8) {
            if (puVar6 != (undefined8 *)0x0) {
              param_3[1] = puVar6;
              __ZdlPv(puVar6);
              uVar9 = 0;
              *param_3 = 0;
              param_3[1] = 0;
              param_3[2] = 0;
            }
            uVar7 = uVar9 * 2;
            if (uVar7 < 9) {
              uVar7 = 8;
            }
            if (0x3ffffffffffffffe < uVar9) {
              uVar7 = 0x7fffffffffffffff;
            }
            puVar6 = (undefined8 *)__Znwm(uVar7);
            *param_3 = puVar6;
            pcVar11 = (char *)(puVar6 + 1);
            *puVar6 = 0x3830304452474c41;
            param_3[1] = pcVar11;
            param_3[2] = (long)puVar6 + uVar7;
          }
          else {
            pcVar14 = (char *)param_3[1];
            uVar9 = (long)pcVar14 - (long)puVar6;
            if (uVar9 < 8) {
              pcVar10 = pcVar14;
              if ((long)pcVar14 - (long)puVar6 != 0) {
                _memcpy(puVar6,"ALGRD008",uVar9);
                pcVar10 = (char *)param_3[1];
              }
              uVar7 = (long)puVar6 + (8 - (long)pcVar14);
              if (0x3f < uVar7) {
                uVar12 = uVar7 & 0xffffffffffffffc0;
                uVar9 = uVar9 | uVar12;
                pcVar11 = pcVar10 + uVar12;
                pcVar10 = pcVar10 + 0x20;
                pcVar14 = "alpha.gu" + ((long)pcVar14 - (long)puVar6);
                uVar13 = uVar12;
                do {
                  uVar15 = *(undefined8 *)(pcVar14 + -0x20);
                  uVar17 = *(undefined8 *)(pcVar14 + -8);
                  uVar16 = *(undefined8 *)(pcVar14 + -0x10);
                  uVar19 = *(undefined8 *)(pcVar14 + 8);
                  uVar18 = *(undefined8 *)pcVar14;
                  uVar21 = *(undefined8 *)(pcVar14 + 0x18);
                  uVar20 = *(undefined8 *)(pcVar14 + 0x10);
                  *(undefined8 *)(pcVar10 + -0x18) = *(undefined8 *)(pcVar14 + -0x18);
                  *(undefined8 *)(pcVar10 + -0x20) = uVar15;
                  *(undefined8 *)(pcVar10 + -8) = uVar17;
                  *(undefined8 *)(pcVar10 + -0x10) = uVar16;
                  *(undefined8 *)(pcVar10 + 8) = uVar19;
                  *(undefined8 *)pcVar10 = uVar18;
                  *(undefined8 *)(pcVar10 + 0x18) = uVar21;
                  *(undefined8 *)(pcVar10 + 0x10) = uVar20;
                  uVar13 = uVar13 - 0x40;
                  pcVar10 = pcVar10 + 0x40;
                  pcVar14 = pcVar14 + 0x40;
                } while (uVar13 != 0);
                pcVar10 = pcVar11;
                if (uVar7 == uVar12) goto LAB_1002145bc;
              }
              do {
                pcVar11 = pcVar10 + 1;
                *pcVar10 = "ALGRD008"[uVar9];
                uVar9 = uVar9 + 1;
                pcVar10 = pcVar11;
              } while (uVar9 != 8);
            }
            else {
              pcVar11 = (char *)(puVar6 + 1);
              *puVar6 = 0x3830304452474c41;
            }
LAB_1002145bc:
            param_3[1] = pcVar11;
          }
          FUN_100216828(param_3,pcVar11,&local_e8,local_d0,0x18);
          FUN_100216c40(param_3,param_3[1],(long)pvVar5 + 0x10,(long)pvVar5 + sVar1,
                        ((long)pvVar5 + sVar1) - ((long)pvVar5 + 0x10));
        }
        __ZdlPv(pvVar5);
        __ZdlPv(pvVar4);
        if (*(long *)PTR____stack_chk_guard_1007c41d0 == local_68) {
          return;
        }
        goto LAB_10021411c;
      }
      uVar3 = 0;
      local_90 = 0;
      uStack_88 = 0;
      local_80 = 0;
      local_78 = 0;
    }
  }
  if (*(long *)PTR____stack_chk_guard_1007c41d0 == local_68) {
    return;
  }
LAB_10021411c:
                    /* WARNING: Subroutine does not return */
  ___stack_chk_fail(uVar3);
}

