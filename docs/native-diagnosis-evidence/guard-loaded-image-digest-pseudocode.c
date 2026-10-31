
bool FUN_100217f70(ulong *param_1,long *param_2,undefined8 *param_3)

{
  long lVar1;
  ulong *puVar2;
  undefined4 uVar3;
  byte bVar4;
  undefined1 uVar5;
  bool bVar6;
  kern_return_t kVar7;
  int iVar8;
  undefined1 *puVar9;
  undefined1 *puVar10;
  size_t sVar11;
  ulong uVar12;
  ulong uVar13;
  undefined1 *puVar14;
  undefined1 *puVar15;
  ulong *puVar16;
  ulong uVar17;
  ulong *puVar18;
  ulong *local_f0;
  undefined1 *local_e0;
  undefined1 *local_d8;
  undefined1 *local_d0;
  mach_port_t local_c8;
  mach_msg_type_number_t mStack_c4;
  mach_vm_size_t local_c0;
  ulong local_b8;
  undefined8 local_b0;
  undefined8 uStack_a8;
  undefined8 uStack_a0;
  undefined8 uStack_98;
  ulong local_90;
  undefined8 uStack_88;
  undefined8 uStack_80;
  undefined8 uStack_78;
  long local_70;
  
  local_70 = *(long *)PTR____stack_chk_guard_1007c41d0;
  bVar4 = *(byte *)((long)param_1 + 0x3f);
  puVar18 = (ulong *)param_1[5];
  if (-1 < (char)bVar4) {
    puVar18 = param_1 + 5;
  }
  local_d8 = (undefined1 *)0x0;
  local_d0 = (undefined1 *)0x0;
  sVar11 = param_1[6];
  if (-1 < (char)bVar4) {
    sVar11 = (ulong)bVar4;
  }
  local_e0 = (undefined1 *)0x0;
  if (sVar11 == 0) {
    puVar18 = (ulong *)param_1[8];
    local_f0 = (ulong *)param_1[9];
    puVar9 = (undefined1 *)0x0;
    if (puVar18 == local_f0) goto LAB_1002191b4;
  }
  else {
    if ((long)sVar11 < 0) {
                    /* WARNING: Subroutine does not return */
      FUN_100216814();
    }
    puVar9 = (undefined1 *)__Znwm(sVar11);
    puVar10 = puVar9 + sVar11;
    local_e0 = puVar9;
    local_d0 = puVar10;
    _memcpy(puVar9,puVar18,sVar11);
    puVar18 = (ulong *)param_1[8];
    local_f0 = (ulong *)param_1[9];
    local_d8 = puVar10;
    if (puVar18 == local_f0) goto LAB_1002191b4;
  }
  do {
    puVar9 = local_e0;
    if ((0x20000000 < puVar18[2]) ||
       (uVar17 = (long)local_d8 - (long)local_e0, 0x20000000 - puVar18[2] < uVar17)) {
LAB_1002191a4:
      bVar6 = false;
      goto LAB_1002191e4;
    }
    uVar13 = *puVar18;
    if (local_d8 < local_d0) {
      puVar14 = local_d8 + 1;
      *local_d8 = (char)uVar13;
    }
    else {
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar17 + 1 || uVar12 - (uVar17 + 1) == 0) {
        uVar12 = uVar17 + 1;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      puVar10 = (undefined1 *)__Znwm(uVar12);
      puVar14 = puVar10 + uVar17 + 1;
      puVar10[uVar17] = (char)uVar13;
      _memcpy(puVar10,puVar9,uVar17);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar14;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar13 >> 8);
    if (puVar14 < local_d0) {
      puVar15 = puVar14 + 1;
      *puVar14 = uVar5;
    }
    else {
      sVar11 = (long)puVar14 - (long)local_e0;
      uVar17 = sVar11 + 1;
      local_d8 = puVar14;
      if ((long)uVar17 < 0) goto LAB_100219230;
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar17 || uVar12 - uVar17 == 0) {
        uVar12 = uVar17;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      if (uVar12 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar12);
      }
      puVar15 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar15;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar13 >> 0x10);
    if (puVar15 < local_d0) {
      puVar14 = puVar15 + 1;
      *puVar15 = uVar5;
    }
    else {
      sVar11 = (long)puVar15 - (long)local_e0;
      uVar17 = sVar11 + 1;
      local_d8 = puVar15;
      if ((long)uVar17 < 0) goto LAB_100219230;
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar17 || uVar12 - uVar17 == 0) {
        uVar12 = uVar17;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      if (uVar12 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar12);
      }
      puVar14 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar14;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar13 >> 0x18);
    if (puVar14 < local_d0) {
      puVar15 = puVar14 + 1;
      *puVar14 = uVar5;
    }
    else {
      sVar11 = (long)puVar14 - (long)local_e0;
      uVar17 = sVar11 + 1;
      local_d8 = puVar14;
      if ((long)uVar17 < 0) goto LAB_100219230;
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar17 || uVar12 - uVar17 == 0) {
        uVar12 = uVar17;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      if (uVar12 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar12);
      }
      puVar15 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar15;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar13 >> 0x20);
    if (puVar15 < local_d0) {
      puVar14 = puVar15 + 1;
      *puVar15 = uVar5;
    }
    else {
      sVar11 = (long)puVar15 - (long)local_e0;
      uVar17 = sVar11 + 1;
      local_d8 = puVar15;
      if ((long)uVar17 < 0) goto LAB_100219230;
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar17 || uVar12 - uVar17 == 0) {
        uVar12 = uVar17;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      if (uVar12 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar12);
      }
      puVar14 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar14;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar13 >> 0x28);
    if (puVar14 < local_d0) {
      puVar15 = puVar14 + 1;
      *puVar14 = uVar5;
    }
    else {
      sVar11 = (long)puVar14 - (long)local_e0;
      uVar17 = sVar11 + 1;
      local_d8 = puVar14;
      if ((long)uVar17 < 0) goto LAB_100219230;
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar17 || uVar12 - uVar17 == 0) {
        uVar12 = uVar17;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      if (uVar12 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar12);
      }
      puVar15 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar15;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar13 >> 0x30);
    if (puVar15 < local_d0) {
      puVar14 = puVar15 + 1;
      *puVar15 = uVar5;
    }
    else {
      sVar11 = (long)puVar15 - (long)local_e0;
      uVar17 = sVar11 + 1;
      local_d8 = puVar15;
      if ((long)uVar17 < 0) goto LAB_100219230;
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar17 || uVar12 - uVar17 == 0) {
        uVar12 = uVar17;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      if (uVar12 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar12);
      }
      puVar14 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar14;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar13 >> 0x38);
    if (puVar14 < local_d0) {
      puVar15 = puVar14 + 1;
      *puVar14 = uVar5;
    }
    else {
      sVar11 = (long)puVar14 - (long)local_e0;
      uVar17 = sVar11 + 1;
      local_d8 = puVar14;
      if ((long)uVar17 < 0) goto LAB_100219230;
      uVar13 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar13 < uVar17 || uVar13 - uVar17 == 0) {
        uVar13 = uVar17;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar13 = 0x7fffffffffffffff;
      }
      if (uVar13 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar13);
      }
      puVar15 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar13;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar15;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar17 = puVar18[1];
    if (puVar15 < local_d0) {
      puVar14 = puVar15 + 1;
      *puVar15 = (char)uVar17;
    }
    else {
      sVar11 = (long)puVar15 - (long)local_e0;
      uVar13 = sVar11 + 1;
      local_d8 = puVar15;
      if ((long)uVar13 < 0) goto LAB_100219230;
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar13 || uVar12 - uVar13 == 0) {
        uVar12 = uVar13;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      if (uVar12 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar12);
      }
      puVar14 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = (char)uVar17;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar14;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar17 >> 8);
    if (puVar14 < local_d0) {
      puVar15 = puVar14 + 1;
      *puVar14 = uVar5;
    }
    else {
      sVar11 = (long)puVar14 - (long)local_e0;
      uVar13 = sVar11 + 1;
      local_d8 = puVar14;
      if ((long)uVar13 < 0) goto LAB_100219230;
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar13 || uVar12 - uVar13 == 0) {
        uVar12 = uVar13;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      if (uVar12 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar12);
      }
      puVar15 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar15;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar17 >> 0x10);
    if (puVar15 < local_d0) {
      puVar14 = puVar15 + 1;
      *puVar15 = uVar5;
    }
    else {
      sVar11 = (long)puVar15 - (long)local_e0;
      uVar13 = sVar11 + 1;
      local_d8 = puVar15;
      if ((long)uVar13 < 0) goto LAB_100219230;
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar13 || uVar12 - uVar13 == 0) {
        uVar12 = uVar13;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      if (uVar12 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar12);
      }
      puVar14 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar14;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar17 >> 0x18);
    if (puVar14 < local_d0) {
      puVar15 = puVar14 + 1;
      *puVar14 = uVar5;
    }
    else {
      sVar11 = (long)puVar14 - (long)local_e0;
      uVar13 = sVar11 + 1;
      local_d8 = puVar14;
      if ((long)uVar13 < 0) goto LAB_100219230;
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar13 || uVar12 - uVar13 == 0) {
        uVar12 = uVar13;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      if (uVar12 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar12);
      }
      puVar15 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar15;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar17 >> 0x20);
    if (puVar15 < local_d0) {
      puVar14 = puVar15 + 1;
      *puVar15 = uVar5;
    }
    else {
      sVar11 = (long)puVar15 - (long)local_e0;
      uVar13 = sVar11 + 1;
      local_d8 = puVar15;
      if ((long)uVar13 < 0) goto LAB_100219230;
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar13 || uVar12 - uVar13 == 0) {
        uVar12 = uVar13;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      if (uVar12 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar12);
      }
      puVar14 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar14;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar17 >> 0x28);
    if (puVar14 < local_d0) {
      puVar15 = puVar14 + 1;
      *puVar14 = uVar5;
    }
    else {
      sVar11 = (long)puVar14 - (long)local_e0;
      uVar13 = sVar11 + 1;
      local_d8 = puVar14;
      if ((long)uVar13 < 0) goto LAB_100219230;
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar13 || uVar12 - uVar13 == 0) {
        uVar12 = uVar13;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      if (uVar12 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar12);
      }
      puVar15 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar15;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar17 >> 0x30);
    if (puVar15 < local_d0) {
      puVar14 = puVar15 + 1;
      *puVar15 = uVar5;
    }
    else {
      sVar11 = (long)puVar15 - (long)local_e0;
      uVar13 = sVar11 + 1;
      local_d8 = puVar15;
      if ((long)uVar13 < 0) goto LAB_100219230;
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar13 || uVar12 - uVar13 == 0) {
        uVar12 = uVar13;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      if (uVar12 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar12);
      }
      puVar14 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar14;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar17 >> 0x38);
    if (puVar14 < local_d0) {
      puVar15 = puVar14 + 1;
      *puVar14 = uVar5;
    }
    else {
      sVar11 = (long)puVar14 - (long)local_e0;
      uVar17 = sVar11 + 1;
      local_d8 = puVar14;
      if ((long)uVar17 < 0) goto LAB_100219230;
      uVar13 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar13 < uVar17 || uVar13 - uVar17 == 0) {
        uVar13 = uVar17;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar13 = 0x7fffffffffffffff;
      }
      if (uVar13 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar13);
      }
      puVar15 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar13;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar15;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar17 = puVar18[2];
    if (puVar15 < local_d0) {
      puVar14 = puVar15 + 1;
      *puVar15 = (char)uVar17;
    }
    else {
      sVar11 = (long)puVar15 - (long)local_e0;
      uVar13 = sVar11 + 1;
      local_d8 = puVar15;
      if ((long)uVar13 < 0) goto LAB_100219230;
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar13 || uVar12 - uVar13 == 0) {
        uVar12 = uVar13;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      if (uVar12 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar12);
      }
      puVar14 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = (char)uVar17;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar14;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar17 >> 8);
    if (puVar14 < local_d0) {
      puVar15 = puVar14 + 1;
      *puVar14 = uVar5;
    }
    else {
      sVar11 = (long)puVar14 - (long)local_e0;
      uVar13 = sVar11 + 1;
      local_d8 = puVar14;
      if ((long)uVar13 < 0) goto LAB_100219230;
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar13 || uVar12 - uVar13 == 0) {
        uVar12 = uVar13;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      if (uVar12 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar12);
      }
      puVar15 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar15;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar17 >> 0x10);
    if (puVar15 < local_d0) {
      puVar14 = puVar15 + 1;
      *puVar15 = uVar5;
    }
    else {
      sVar11 = (long)puVar15 - (long)local_e0;
      uVar13 = sVar11 + 1;
      local_d8 = puVar15;
      if ((long)uVar13 < 0) goto LAB_100219230;
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar13 || uVar12 - uVar13 == 0) {
        uVar12 = uVar13;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      if (uVar12 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar12);
      }
      puVar14 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar14;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar17 >> 0x18);
    if (puVar14 < local_d0) {
      puVar15 = puVar14 + 1;
      *puVar14 = uVar5;
    }
    else {
      sVar11 = (long)puVar14 - (long)local_e0;
      uVar13 = sVar11 + 1;
      local_d8 = puVar14;
      if ((long)uVar13 < 0) goto LAB_100219230;
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar13 || uVar12 - uVar13 == 0) {
        uVar12 = uVar13;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      if (uVar12 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar12);
      }
      puVar15 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar15;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar17 >> 0x20);
    if (puVar15 < local_d0) {
      puVar14 = puVar15 + 1;
      *puVar15 = uVar5;
    }
    else {
      sVar11 = (long)puVar15 - (long)local_e0;
      uVar13 = sVar11 + 1;
      local_d8 = puVar15;
      if ((long)uVar13 < 0) goto LAB_100219230;
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar13 || uVar12 - uVar13 == 0) {
        uVar12 = uVar13;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      if (uVar12 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar12);
      }
      puVar14 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar14;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar17 >> 0x28);
    if (puVar14 < local_d0) {
      puVar15 = puVar14 + 1;
      *puVar14 = uVar5;
    }
    else {
      sVar11 = (long)puVar14 - (long)local_e0;
      uVar13 = sVar11 + 1;
      local_d8 = puVar14;
      if ((long)uVar13 < 0) goto LAB_100219230;
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar13 || uVar12 - uVar13 == 0) {
        uVar12 = uVar13;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      if (uVar12 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar12);
      }
      puVar15 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar15;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar17 >> 0x30);
    if (puVar15 < local_d0) {
      puVar14 = puVar15 + 1;
      *puVar15 = uVar5;
    }
    else {
      sVar11 = (long)puVar15 - (long)local_e0;
      uVar13 = sVar11 + 1;
      local_d8 = puVar15;
      if ((long)uVar13 < 0) goto LAB_100219230;
      uVar12 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar12 < uVar13 || uVar12 - uVar13 == 0) {
        uVar12 = uVar13;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar12 = 0x7fffffffffffffff;
      }
      if (uVar12 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar12);
      }
      puVar14 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar12;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar14;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)(uVar17 >> 0x38);
    if (puVar14 < local_d0) {
      puVar15 = puVar14 + 1;
      *puVar14 = uVar5;
    }
    else {
      sVar11 = (long)puVar14 - (long)local_e0;
      uVar17 = sVar11 + 1;
      local_d8 = puVar14;
      if ((long)uVar17 < 0) goto LAB_100219230;
      uVar13 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar13 < uVar17 || uVar13 - uVar17 == 0) {
        uVar13 = uVar17;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar13 = 0x7fffffffffffffff;
      }
      if (uVar13 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar13);
      }
      puVar15 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar13;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar15;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar3 = (undefined4)puVar18[3];
    if (puVar15 < local_d0) {
      puVar14 = puVar15 + 1;
      *puVar15 = (char)uVar3;
    }
    else {
      sVar11 = (long)puVar15 - (long)local_e0;
      uVar17 = sVar11 + 1;
      local_d8 = puVar15;
      if ((long)uVar17 < 0) goto LAB_100219230;
      uVar13 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar13 < uVar17 || uVar13 - uVar17 == 0) {
        uVar13 = uVar17;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar13 = 0x7fffffffffffffff;
      }
      if (uVar13 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar13);
      }
      puVar14 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = (char)uVar3;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar13;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar14;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)((uint)uVar3 >> 8);
    if (puVar14 < local_d0) {
      puVar15 = puVar14 + 1;
      *puVar14 = uVar5;
    }
    else {
      sVar11 = (long)puVar14 - (long)local_e0;
      uVar17 = sVar11 + 1;
      local_d8 = puVar14;
      if ((long)uVar17 < 0) goto LAB_100219230;
      uVar13 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar13 < uVar17 || uVar13 - uVar17 == 0) {
        uVar13 = uVar17;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar13 = 0x7fffffffffffffff;
      }
      if (uVar13 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar13);
      }
      puVar15 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar13;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar15;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)((uint)uVar3 >> 0x10);
    if (puVar15 < local_d0) {
      puVar14 = puVar15 + 1;
      *puVar15 = uVar5;
    }
    else {
      sVar11 = (long)puVar15 - (long)local_e0;
      uVar17 = sVar11 + 1;
      local_d8 = puVar15;
      if ((long)uVar17 < 0) goto LAB_100219230;
      uVar13 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar13 < uVar17 || uVar13 - uVar17 == 0) {
        uVar13 = uVar17;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar13 = 0x7fffffffffffffff;
      }
      if (uVar13 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar13);
      }
      puVar14 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar13;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar14;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    uVar5 = (undefined1)((uint)uVar3 >> 0x18);
    if (puVar14 < local_d0) {
      puVar15 = puVar14 + 1;
      *puVar14 = uVar5;
    }
    else {
      sVar11 = (long)puVar14 - (long)local_e0;
      uVar17 = sVar11 + 1;
      local_d8 = puVar14;
      if ((long)uVar17 < 0) {
LAB_100219230:
                    /* WARNING: Subroutine does not return */
        FUN_100216814();
      }
      uVar13 = ((long)local_d0 - (long)local_e0) * 2;
      if (uVar13 < uVar17 || uVar13 - uVar17 == 0) {
        uVar13 = uVar17;
      }
      if (0x3ffffffffffffffe < (ulong)((long)local_d0 - (long)local_e0)) {
        uVar13 = 0x7fffffffffffffff;
      }
      if (uVar13 == 0) {
        puVar10 = (undefined1 *)0x0;
      }
      else {
        puVar10 = (undefined1 *)__Znwm(uVar13);
      }
      puVar15 = puVar10 + sVar11 + 1;
      puVar10[sVar11] = uVar5;
      _memcpy(puVar10,puVar9,sVar11);
      local_e0 = puVar10;
      local_d0 = puVar10 + uVar13;
      if (puVar9 != (undefined1 *)0x0) {
        local_d8 = puVar15;
        __ZdlPv(puVar9);
      }
    }
    puVar9 = local_e0;
    local_d8 = puVar15;
    if (param_2 == (long *)0x0) {
      uVar17 = puVar18[1] - param_1[1];
      if ((param_1[1] <= puVar18[1]) && (!CARRY8(*param_1,uVar17))) {
        uVar13 = puVar18[2];
        uVar17 = *param_1 + uVar17;
        if (!CARRY8(uVar17,uVar13)) {
          uVar12 = uVar17;
          if (uVar17 < uVar13 + uVar17) {
            do {
              local_c0 = 0;
              local_90 = local_90 & 0xffffffff00000000;
              uStack_a8 = 0;
              local_b0 = 0;
              uStack_98 = 0;
              uStack_a0 = 0;
              local_c8 = 0;
              mStack_c4 = 9;
              local_b8 = uVar12;
              kVar7 = _mach_vm_region(*(vm_map_t *)PTR__mach_task_self__1007c43d0,&local_b8,
                                      &local_c0,9,(vm_region_info_t)&local_b0,&mStack_c4,&local_c8);
              if (local_c8 != 0) {
                _mach_port_deallocate(*(ipc_space_t *)PTR__mach_task_self__1007c43d0,local_c8);
              }
              if (((kVar7 != 0) || (uVar12 < local_b8)) || (local_c0 == 0)) goto LAB_1002191a4;
              if ((((uint)local_b0 & 3) != 1) || (CARRY8(local_b8,local_c0))) goto LAB_1002191a4;
              uVar12 = local_c0 + local_b8;
            } while (local_c0 + local_b8 < uVar13 + uVar17);
            uVar13 = puVar18[2];
          }
          FUN_10021b3fc(&local_e0,local_d8,uVar17,uVar17 + uVar13);
          goto LAB_100219148;
        }
      }
      goto LAB_1002191a4;
    }
    bVar6 = false;
    uVar17 = *puVar18;
    uVar13 = param_2[1] - *param_2;
    if ((uVar13 < uVar17) || (uVar13 - uVar17 < puVar18[2])) goto LAB_1002191e4;
    lVar1 = uVar17 + *param_2;
    FUN_10021af80(&local_e0,puVar15,lVar1,lVar1 + puVar18[2]);
LAB_100219148:
    puVar2 = (ulong *)param_1[0xc];
    for (puVar16 = (ulong *)param_1[0xb]; puVar16 != puVar2; puVar16 = puVar16 + 2) {
      uVar17 = *puVar16;
      uVar13 = *puVar18;
      if ((uVar13 <= uVar17) && (uVar17 - uVar13 < puVar18[2])) {
        sVar11 = puVar16[1];
        if (puVar18[2] - (uVar17 - uVar13) < sVar11) goto LAB_1002191a4;
        if (sVar11 != 0) {
          _bzero(local_e0 + (long)(puVar15 + (uVar17 - (long)(puVar9 + uVar13))),sVar11);
        }
      }
    }
    puVar18 = puVar18 + 4;
    puVar9 = local_e0;
  } while (puVar18 != local_f0);
LAB_1002191b4:
  uStack_88 = 0;
  local_90 = 0;
  uStack_78 = 0;
  uStack_80 = 0;
  uStack_a8 = 0;
  local_b0 = 0;
  uStack_98 = 0;
  uStack_a0 = 0;
  iVar8 = _crypto_hash_sha512_tweet(&local_b0,puVar9,(long)local_d8 - (long)puVar9);
  bVar6 = iVar8 == 0;
  if (iVar8 == 0) {
    param_3[1] = uStack_a8;
    *param_3 = local_b0;
    param_3[3] = uStack_98;
    param_3[2] = uStack_a0;
  }
LAB_1002191e4:
  if (local_e0 != (undefined1 *)0x0) {
    local_d8 = local_e0;
    __ZdlPv();
  }
  if (*(long *)PTR____stack_chk_guard_1007c41d0 == local_70) {
    return bVar6;
  }
                    /* WARNING: Subroutine does not return */
  ___stack_chk_fail();
}

