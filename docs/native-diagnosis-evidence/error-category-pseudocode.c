
undefined1  [16] FUN_1000e8054(ulong *param_1,ulong param_2)

{
  char *pcVar1;
  undefined1 auVar2 [16];
  int iVar3;
  ulong uVar4;
  ulong uVar5;
  undefined1 auVar6 [16];
  undefined1 auVar7 [16];
  undefined1 auVar8 [16];
  undefined1 auVar9 [16];
  undefined1 auVar10 [16];
  undefined1 auVar11 [16];
  
  if (param_2 < 0x18) goto LAB_1000e81d4;
  if ((*param_1 == 0x5954495255434553 && param_1[1] == 0x454d49544e55525f) &&
      param_1[2] == 0x5f5943494c4f505f) {
    param_1 = param_1 + 3;
    if (param_2 != 0x1c) goto LAB_1000e81d4;
    goto LAB_1000e814c;
  }
  if (param_2 == 0x18) goto LAB_1000e81d4;
  uVar4 = 0x52554e54494d455f;
  uVar5 = (*param_1 & 0xff00ff00ff00ff00) >> 8 | (*param_1 & 0xff00ff00ff00ff) << 8;
  uVar5 = (uVar5 & 0xffff0000ffff0000) >> 0x10 | (uVar5 & 0xffff0000ffff) << 0x10;
  uVar5 = uVar5 >> 0x20 | uVar5 << 0x20;
  if (uVar5 == 0x52554e54494d455f) {
    uVar4 = 0x4f5045524154494f;
    uVar5 = (param_1[1] & 0xff00ff00ff00ff00) >> 8 | (param_1[1] & 0xff00ff00ff00ff) << 8;
    uVar5 = (uVar5 & 0xffff0000ffff0000) >> 0x10 | (uVar5 & 0xffff0000ffff) << 0x10;
    uVar5 = uVar5 >> 0x20 | uVar5 << 0x20;
    if (uVar5 != 0x4f5045524154494f) goto LAB_1000e812c;
    uVar4 = 0x4e5f504f4c494359;
    uVar5 = (param_1[2] & 0xff00ff00ff00ff00) >> 8 | (param_1[2] & 0xff00ff00ff00ff) << 8;
    uVar5 = (uVar5 & 0xffff0000ffff0000) >> 0x10 | (uVar5 & 0xffff0000ffff) << 0x10;
    uVar5 = uVar5 >> 0x20 | uVar5 << 0x20;
    if (uVar5 != 0x4e5f504f4c494359) goto LAB_1000e812c;
    iVar3 = 0x5f - (uint)(byte)param_1[3];
  }
  else {
LAB_1000e812c:
    iVar3 = 1;
    if (uVar4 < uVar5) {
      iVar3 = -1;
    }
  }
  if ((iVar3 == 0) && (param_1 = (ulong *)((long)param_1 + 0x19), param_2 == 0x1d)) {
LAB_1000e814c:
    if ((int)*param_1 == 0x3130312d) {
      auVar7._8_8_ = 7;
      auVar7._0_8_ = "expired";
      return auVar7;
    }
    if ((int)*param_1 == 0x3230312d) {
      auVar8._8_8_ = 8;
      auVar8._0_8_ = "rollback";
      return auVar8;
    }
    if ((int)*param_1 == 0x3330312d) {
      auVar9._8_8_ = 9;
      auVar9._0_8_ = "integrity";
      return auVar9;
    }
    if ((int)*param_1 != 0x3430312d) {
      if ((int)*param_1 != 0x3530312d) {
        pcVar1 = (char *)0x0;
        if ((int)*param_1 == 0x3630312d) {
          pcVar1 = "not_yet_effective";
        }
        auVar6._8_8_ = 0x11;
        auVar6._0_8_ = pcVar1;
        return auVar6;
      }
      auVar11._8_8_ = 5;
      auVar11._0_8_ = "state";
      return auVar11;
    }
    auVar10._8_8_ = 8;
    auVar10._0_8_ = "analysis";
    return auVar10;
  }
LAB_1000e81d4:
  auVar2._8_8_ = 0;
  auVar2._0_8_ = param_2;
  return auVar2 << 0x40;
}

