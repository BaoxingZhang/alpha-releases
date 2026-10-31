
uint FUN_100217de8(ulong param_1,ulong *param_2)

{
  ulong uVar1;
  int iVar2;
  uint uVar3;
  int *piVar4;
  long lVar5;
  ulong uVar6;
  uint uVar7;
  int *piVar8;
  undefined1 auStack_458 [1024];
  long local_58;
  
  local_58 = *(long *)PTR____stack_chk_guard_1007c41d0;
  iVar2 = __dyld_image_count();
  if (iVar2 != 0) {
    uVar7 = 0;
    do {
      piVar4 = (int *)__dyld_get_image_header(uVar7);
      if ((piVar4 != (int *)0x0) && (*piVar4 == -0x1120531)) {
        lVar5 = __dyld_get_image_vmaddr_slide(uVar7);
        iVar2 = piVar4[4];
        if (iVar2 != 0) {
          piVar8 = piVar4 + 8;
          do {
            uVar3 = piVar8[1];
            if ((uVar3 < 8) ||
               ((int *)((long)(piVar4 + 8) + (ulong)(uint)piVar4[5]) <
                (int *)((long)piVar8 + (ulong)uVar3))) {
LAB_100217f20:
              param_1 = 0;
              uVar7 = 1;
              goto LAB_100217f30;
            }
            if ((0x47 < uVar3 && *piVar8 == 0x19) &&
               ((((*(byte *)(piVar8 + 0xf) >> 2 & 1) != 0 &&
                 (uVar1 = *(long *)(piVar8 + 6) + lVar5, uVar1 <= param_1)) &&
                (param_1 - uVar1 < *(ulong *)(piVar8 + 8))))) {
              lVar5 = __dyld_get_image_name(uVar7);
              if (lVar5 == 0) goto LAB_100217f20;
              lVar5 = _realpath_DARWIN_EXTSN(lVar5,auStack_458);
              param_1 = (ulong)(lVar5 != 0);
              if (lVar5 != 0) {
                FUN_1002195a8(param_2 + 2,auStack_458);
                uVar6 = *(ulong *)(piVar8 + 6);
                *param_2 = uVar1;
                param_2[1] = uVar6;
              }
              uVar7 = 1;
              goto LAB_100217f30;
            }
            iVar2 = iVar2 + -1;
            piVar8 = (int *)((long)piVar8 + (ulong)uVar3);
          } while (iVar2 != 0);
        }
      }
      uVar7 = uVar7 + 1;
      uVar3 = __dyld_image_count();
    } while (uVar7 < uVar3);
  }
  uVar7 = 0;
LAB_100217f30:
  if (*(long *)PTR____stack_chk_guard_1007c41d0 == local_58) {
    return uVar7 & (uint)param_1;
  }
                    /* WARNING: Subroutine does not return */
  ___stack_chk_fail();
}

