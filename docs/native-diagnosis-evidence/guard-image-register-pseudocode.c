
/* WARNING: Type propagation algorithm not settling */

undefined8 FUN_100217224(undefined8 param_1,char *param_2,ulong *param_3)

{
  long *plVar1;
  int *piVar2;
  long *plVar3;
  ulong *puVar4;
  ulong *puVar5;
  long *plVar6;
  code *pcVar7;
  bool bVar8;
  int iVar9;
  int iVar10;
  int *piVar11;
  ssize_t sVar12;
  char *******pppppppcVar13;
  char *******pppppppcVar14;
  uint uVar15;
  long lVar16;
  ulong uVar17;
  ulong uVar18;
  ulong uVar19;
  uint uVar20;
  undefined8 uVar21;
  ulong uVar22;
  size_t sVar23;
  long *plVar24;
  ulong uVar25;
  long lVar26;
  ulong uVar27;
  int *local_238;
  long lStack_230;
  long local_228;
  undefined8 local_220;
  undefined8 uStack_218;
  char *******local_210;
  undefined8 uStack_208;
  long lStack_200;
  char *******local_1f8;
  undefined5 local_1f0;
  undefined3 uStack_1eb;
  undefined5 uStack_1e8;
  undefined1 uStack_1e3;
  undefined1 uStack_1e2;
  byte bStack_1e1;
  ulong *local_1e0;
  ulong *local_1d8;
  undefined8 local_1d0;
  long *plStack_1c8;
  long *local_1c0;
  long *local_1b8;
  undefined1 local_1b0;
  stat local_1a0;
  stat local_110;
  long local_78;
  
  local_78 = *(long *)PTR____stack_chk_guard_1007c41d0;
  local_1b0 = 0;
  plStack_1c8 = (long *)0x0;
  local_1d0 = 0;
  local_1b8 = (long *)0x0;
  local_1c0 = (long *)0x0;
  uStack_1e8 = 0;
  uStack_1e3 = 0;
  uStack_1e2 = 0;
  bStack_1e1 = 0;
  local_1f0 = 0;
  uStack_1eb = 0;
  local_1d8 = (ulong *)0x0;
  local_1e0 = (ulong *)0x0;
  uStack_208 = 0;
  local_210 = (char *******)0x0;
  local_1f8 = (char *******)0x0;
  lStack_200 = 0;
  uStack_218 = 0;
  local_220 = 0;
  local_238 = (int *)0x0;
  lStack_230 = 0;
  local_228 = 0;
  iVar9 = FUN_100217de8(param_1,&local_220);
  if (iVar9 == 0) {
    uVar21 = 0;
  }
  else {
    pppppppcVar13 = local_210;
    if (-1 < lStack_200) {
      pppppppcVar13 = (char *******)&local_210;
    }
    iVar9 = _open((char *)pppppppcVar13,0x1000100);
    if (iVar9 < 0) {
LAB_100217c2c:
      uVar21 = 0;
    }
    else {
      local_110.st_gen = 0;
      local_110.st_lspare = 0;
      local_110.st_blksize = 0;
      local_110.st_flags = 0;
      local_110.st_qspare[1] = 0;
      local_110.st_qspare[0] = 0;
      local_110.st_birthtimespec.tv_nsec = 0;
      local_110.st_birthtimespec.tv_sec = 0;
      local_110.st_blocks = 0;
      local_110.st_size = 0;
      local_110.st_mtimespec.tv_nsec = 0;
      local_110.st_mtimespec.tv_sec = 0;
      local_110.st_ctimespec.tv_nsec = 0;
      local_110.st_ctimespec.tv_sec = 0;
      local_110._24_8_ = 0;
      local_110.st_uid = 0;
      local_110.st_gid = 0;
      local_110.st_atimespec.tv_nsec = 0;
      local_110.st_atimespec.tv_sec = 0;
      local_1a0.st_qspare[1] = 0;
      local_1a0.st_qspare[0] = 0;
      local_110.st_ino = 0;
      local_110.st_dev = 0;
      local_110.st_mode = 0;
      local_110.st_nlink = 0;
      local_1a0.st_blocks = 0;
      local_1a0.st_size = 0;
      local_1a0.st_gen = 0;
      local_1a0.st_lspare = 0;
      local_1a0.st_blksize = 0;
      local_1a0.st_flags = 0;
      local_1a0.st_ctimespec.tv_nsec = 0;
      local_1a0.st_ctimespec.tv_sec = 0;
      local_1a0.st_birthtimespec.tv_nsec = 0;
      local_1a0.st_birthtimespec.tv_sec = 0;
      local_1a0.st_atimespec.tv_nsec = 0;
      local_1a0.st_atimespec.tv_sec = 0;
      local_1a0.st_mtimespec.tv_nsec = 0;
      local_1a0.st_mtimespec.tv_sec = 0;
      local_1a0.st_ino = 0;
      local_1a0.st_dev = 0;
      local_1a0.st_mode = 0;
      local_1a0.st_nlink = 0;
      local_1a0.st_rdev = 0;
      local_1a0._28_4_ = 0;
      local_1a0.st_uid = 0;
      local_1a0.st_gid = 0;
      iVar10 = _fstat(iVar9,&local_110);
      uVar25 = local_110.st_size;
      bVar8 = false;
      if (((iVar10 == 0) && ((local_110.st_mode & 0xf012) == 0x8000)) &&
         (local_110.st_size - 1U >> 0x1d == 0)) {
        piVar11 = (int *)__Znwm(local_110.st_size);
        lVar16 = (long)piVar11 + uVar25;
        _bzero(piVar11,uVar25);
        local_238 = piVar11;
        lStack_230 = lVar16;
        local_228 = lVar16;
        if (uVar25 != 0) {
          uVar22 = 0;
          do {
            sVar12 = _pread(iVar9,(void *)((long)local_238 + uVar22),uVar25 - uVar22,uVar22);
            if (sVar12 < 0) {
              piVar11 = ___error();
              if (*piVar11 != 4) goto LAB_1002173e0;
            }
            else {
              if (sVar12 == 0) goto LAB_1002173e0;
              uVar22 = sVar12 + uVar22;
            }
            uVar25 = lVar16 - (long)local_238;
          } while (uVar22 < uVar25);
        }
        iVar10 = _fstat(iVar9,&local_1a0);
        if (iVar10 == 0) {
          if (((local_1a0.st_dev == local_110.st_dev) && (local_1a0.st_ino == local_110.st_ino)) &&
             (local_1a0.st_size == local_110.st_size)) {
            bVar8 = local_1a0.st_mtimespec.tv_sec == local_110.st_mtimespec.tv_sec;
            goto LAB_1002173e4;
          }
        }
LAB_1002173e0:
        bVar8 = false;
      }
LAB_1002173e4:
      _close(iVar9);
      piVar11 = local_238;
      if (!bVar8) goto LAB_100217c2c;
      uVar25 = lStack_230 - (long)local_238;
      if (uVar25 < 0x40) {
        uVar21 = 0;
        goto joined_r0x000100217c34;
      }
      if (*local_238 != 0x464c457f) {
        if (*local_238 == -0x1120531) {
          uVar22 = (ulong)(uint)local_238[4];
          uVar20 = local_238[5];
          if ((0xfffffdff < local_238[4] - 0x201U && uVar20 < 0x1000001) &&
              (ulong)uVar20 <= uVar25 - 0x20) {
            uVar17 = (ulong)uVar20 + 0x20;
            uVar27 = 0x20;
            do {
              plVar6 = plStack_1c8;
              uVar21 = 0;
              if ((uVar17 < uVar27) || (uVar17 - uVar27 < 8)) goto joined_r0x000100217c34;
              piVar2 = (int *)((long)piVar11 + uVar27);
              uVar20 = piVar2[1];
              if ((uVar20 < 8 || (uVar20 & 7) != 0) || (uVar17 - uVar27 < (ulong)uVar20))
              goto LAB_100217c2c;
              if (*piVar2 == 0x1d) {
                if (uVar20 != 0x10) goto LAB_100217c2c;
                if (local_1c0 < local_1b8) {
                  *local_1c0 = uVar27 + 8;
                  local_1c0[1] = 8;
                  local_1c0 = local_1c0 + 2;
                }
                else {
                  sVar23 = (long)local_1c0 - (long)plStack_1c8;
                  uVar18 = ((long)sVar23 >> 4) + 1;
                  if (uVar18 >> 0x3c != 0) {
                    FUN_100219924();
                    /* WARNING: Does not return */
                    pcVar7 = (code *)SoftwareBreakpoint(1,0x100217db8);
                    (*pcVar7)();
                  }
                  uVar19 = (long)local_1b8 - (long)plStack_1c8 >> 3;
                  if (uVar19 <= uVar18) {
                    uVar19 = uVar18;
                  }
                  if (0x7fffffffffffffef < (ulong)((long)local_1b8 - (long)plStack_1c8)) {
                    uVar19 = 0xfffffffffffffff;
                  }
                  if (uVar19 >> 0x3c != 0) {
                    /* WARNING: Subroutine does not return */
                    FUN_1001fe9a8();
                  }
                  lVar16 = __Znwm(uVar19 << 4);
                  plVar24 = (long *)(lVar16 + sVar23);
                  plVar3 = (long *)(lVar16 + uVar19 * 0x10);
                  *plVar24 = uVar27 + 8;
                  plVar24[1] = 8;
                  plVar1 = plVar24 + 2;
                  plVar24 = plVar24 + ((long)sVar23 >> 4) * -2;
                  _memcpy(plVar24,plVar6,sVar23);
                  plStack_1c8 = plVar24;
                  local_1c0 = plVar1;
                  local_1b8 = plVar3;
                  if (plVar6 != (long *)0x0) {
                    __ZdlPv(plVar6);
                    local_1c0 = plVar1;
                  }
                }
              }
              else if (*piVar2 == 0x19) {
                if ((uVar20 < 0x48) || (0x1000 < (uint)piVar2[0x10])) goto LAB_100217c2c;
                uVar18 = *(ulong *)((long)piVar11 + uVar27 + 0x30);
                uVar21 = 0;
                if (uVar20 != piVar2[0x10] * 0x50 + 0x48U ||
                    *(ulong *)((long)piVar11 + uVar27 + 0x20) < uVar18) goto joined_r0x000100217c34;
                uVar19 = *(ulong *)(piVar2 + 10);
                if ((uVar25 < uVar19) || (uVar25 - uVar19 < uVar18)) goto joined_r0x000100217c34;
                if (*(long *)(piVar2 + 2) == 0x44454b4e494c5f5f &&
                    *(long *)((long)piVar2 + 0xb) == 0x544944454b4e49) {
                  local_110.st_ino = 8;
                  local_110._0_8_ = uVar27 + 0x20;
                  FUN_100219828(&plStack_1c8,&local_110);
                  local_110.st_ino = 8;
                  local_110._0_8_ = uVar27 + 0x30;
                  FUN_100219828(&plStack_1c8,&local_110);
                }
                else {
                  uVar15 = piVar2[0xf];
                  if ((((uVar15 & 1) != 0) && ((uVar15 >> 1 & 1) == 0)) && (uVar18 != 0)) {
                    local_110.st_ino = *(__darwin_ino64_t *)(piVar2 + 6);
                    local_110.st_rdev = uVar15;
                    local_110._0_8_ = uVar19;
                    local_110._16_8_ = uVar18;
                    FUN_100219740(&local_1e0,&local_110);
                  }
                }
              }
              uVar27 = uVar27 + uVar20;
              uVar22 = uVar22 - 1;
            } while (uVar22 != 0);
            if (uVar27 == uVar17) {
              pppppppcVar13 = (char *******)__Znwm(0x19);
              pppppppcVar13[1] = (char ******)0x6863616d2e647261;
              *pppppppcVar13 = (char ******)0x75672e6168706c61;
              builtin_strncpy((char *)((long)pppppppcVar13 + 0xf),"ho64.v1",8);
              *(char *)((long)pppppppcVar13 + 0x17) = '\0';
              if ((char)bStack_1e1 < '\0') {
                __ZdlPv(local_1f8);
              }
              uStack_1e8 = 0x19;
              uStack_1e3 = 0;
              uStack_1e2 = 0;
              bStack_1e1 = 0x80;
              local_1f0 = 0x17;
              uStack_1eb = 0;
              local_1f8 = pppppppcVar13;
              if (local_1e0 != local_1d8) goto LAB_1002177c4;
            }
          }
        }
        goto LAB_100217c2c;
      }
      if ((((char)local_238[1] != '\x02') || (*(char *)((long)local_238 + 5) != '\x01')) ||
         ((*(char *)((long)local_238 + 6) != '\x01' || (*(ushort *)(local_238 + 4) - 4 < 0xfffffffe)
          ))) goto LAB_100217c2c;
      uVar21 = 0;
      if ((*(short *)((long)local_238 + 0x36) == 0x38) &&
         (uVar22 = (ulong)*(ushort *)(local_238 + 0xe),
         0xffffff7f < *(ushort *)(local_238 + 0xe) - 0x81)) {
        uVar21 = 0;
        uVar17 = *(ulong *)(local_238 + 8);
        if ((uVar17 <= uVar25) && (uVar22 * 0x38 <= uVar25 - uVar17)) {
          piVar11 = (int *)((long)local_238 + uVar17);
          do {
            if (*piVar11 == 1) {
              uVar17 = *(ulong *)(piVar11 + 8);
              if ((*(ulong *)(piVar11 + 10) < uVar17) ||
                 (uVar25 < *(ulong *)(piVar11 + 2) || uVar25 - *(ulong *)(piVar11 + 2) < uVar17))
              goto LAB_100217c2c;
              uVar20 = piVar11[1];
              if (((uVar20 >> 2 & 1) != 0) && (((uVar20 >> 1 & 1) == 0 && (uVar17 != 0)))) {
                local_110.st_ino = *(__darwin_ino64_t *)(piVar11 + 4);
                local_110._0_8_ = *(undefined8 *)(piVar11 + 2);
                local_110.st_rdev = uVar20;
                local_110._16_8_ = uVar17;
                FUN_100219740(&local_1e0,&local_110);
              }
            }
            piVar11 = piVar11 + 0xe;
            uVar22 = uVar22 - 1;
          } while (uVar22 != 0);
          if ((char)bStack_1e1 < '\0') {
            __ZdlPv(local_1f8);
          }
          local_1f8 = (char *******)0x75672e6168706c61;
          local_1f0 = 0x652e647261;
          uStack_1eb = 0x36666c;
          uStack_1e8 = 0x31762e34;
          uStack_1e3 = 0;
          bStack_1e1 = 0x15;
          if (local_1e0 != local_1d8) {
LAB_1002177c4:
            uStack_1e3 = 0;
            uVar25 = (long)local_1d8 - (long)local_1e0 >> 5;
            if (uVar25 < 0x81) {
              FUN_100219938(local_1e0,local_1d8,LZCOUNT(uVar25) << 1 ^ 0x7e,1);
              puVar5 = local_1e0;
              lVar16 = (long)local_1d8 - (long)local_1e0;
              if (lVar16 != 0) {
                pppppppcVar13 = local_1f8;
                if (-1 < (char)bStack_1e1) {
                  pppppppcVar13 = (char *******)&local_1f8;
                }
                uVar25 = CONCAT35(uStack_1eb,local_1f0);
                if (-1 < (char)bStack_1e1) {
                  uVar25 = (ulong)bStack_1e1;
                }
                if ((long)uVar25 < 5) {
                  uVar20 = (byte)((byte)local_1e0[3] >> 2) & 1;
                  if (lVar16 != 0x20) {
                    lVar16 = (lVar16 >> 5) + -1;
                    do {
                      if (puVar5[4] < puVar5[2] + *puVar5) goto LAB_100217c2c;
                      uVar20 = uVar20 | ((byte)puVar5[7] & 4) >> 2;
                      lVar16 = lVar16 + -1;
                      puVar5 = puVar5 + 4;
                    } while (lVar16 != 0);
                  }
                }
                else {
                  lVar26 = 0;
                  uVar20 = 0;
                  do {
                    puVar4 = puVar5 + lVar26 * 4;
                    if ((lVar26 != 0) && (*puVar4 < puVar4[-2] + puVar4[-4])) goto LAB_100217c2c;
                    uVar22 = puVar4[3];
                    pppppppcVar14 = pppppppcVar13;
                    uVar17 = uVar25;
                    while (piVar11 = _memchr(pppppppcVar14,0x65,uVar17 - 4), piVar11 != (int *)0x0)
                    {
                      if (*piVar11 == 0x36666c65 && (char)piVar11[1] == '4') {
                        if ((piVar11 != (int *)((long)pppppppcVar13 + uVar25)) &&
                           ((long)piVar11 - (long)pppppppcVar13 != -1)) {
                          uVar15 = 1;
                          goto LAB_100217d00;
                        }
                        break;
                      }
                      pppppppcVar14 = (char *******)((long)piVar11 + 1);
                      uVar17 = (long)((long)pppppppcVar13 + uVar25) - (long)pppppppcVar14;
                      if ((long)uVar17 < 5) break;
                    }
                    uVar15 = 4;
LAB_100217d00:
                    uVar20 = uVar20 | (uVar15 & (uint)uVar22) != 0;
                    lVar26 = lVar26 + 1;
                  } while (lVar26 != lVar16 >> 5);
                }
                if (uVar20 != 0) {
                  iVar9 = FUN_100217f70(&local_220,&local_238,param_3);
                  uVar21 = 0;
                  if (iVar9 != 0) {
                    if (((((((param_2[1] == *(char *)((long)param_3 + 1)) &&
                            (*param_2 == (char)*param_3)) &&
                           (param_2[2] == *(char *)((long)param_3 + 2))) &&
                          ((param_2[3] == *(char *)((long)param_3 + 3) &&
                           (param_2[4] == *(char *)((long)param_3 + 4))))) &&
                         ((param_2[5] == *(char *)((long)param_3 + 5) &&
                          ((param_2[6] == *(char *)((long)param_3 + 6) &&
                           (param_2[7] == *(char *)((long)param_3 + 7))))))) &&
                        ((param_2[8] == (char)param_3[1] &&
                         ((((((param_2[9] == *(char *)((long)param_3 + 9) &&
                              (param_2[10] == *(char *)((long)param_3 + 10))) &&
                             (param_2[0xb] == *(char *)((long)param_3 + 0xb))) &&
                            (((param_2[0xc] == *(char *)((long)param_3 + 0xc) &&
                              (param_2[0xd] == *(char *)((long)param_3 + 0xd))) &&
                             ((param_2[0xe] == *(char *)((long)param_3 + 0xe) &&
                              ((param_2[0xf] == *(char *)((long)param_3 + 0xf) &&
                               (param_2[0x10] == (char)param_3[2])))))))) &&
                           (param_2[0x11] == *(char *)((long)param_3 + 0x11))) &&
                          (((param_2[0x12] == *(char *)((long)param_3 + 0x12) &&
                            (param_2[0x13] == *(char *)((long)param_3 + 0x13))) &&
                           (param_2[0x14] == *(char *)((long)param_3 + 0x14))))))))) &&
                       ((((param_2[0x15] == *(char *)((long)param_3 + 0x15) &&
                          (param_2[0x16] == *(char *)((long)param_3 + 0x16))) &&
                         (((param_2[0x17] == *(char *)((long)param_3 + 0x17) &&
                           ((param_2[0x18] == (char)param_3[3] &&
                            (param_2[0x19] == *(char *)((long)param_3 + 0x19))))) &&
                          (param_2[0x1a] == *(char *)((long)param_3 + 0x1a))))) &&
                        ((((param_2[0x1b] == *(char *)((long)param_3 + 0x1b) &&
                           (param_2[0x1c] == *(char *)((long)param_3 + 0x1c))) &&
                          (param_2[0x1d] == *(char *)((long)param_3 + 0x1d))) &&
                         ((param_2[0x1e] == *(char *)((long)param_3 + 0x1e) &&
                          (param_2[0x1f] == *(char *)((long)param_3 + 0x1f))))))))) {
                      local_110.st_ino = 0;
                      local_110.st_dev = 0;
                      local_110.st_mode = 0;
                      local_110.st_nlink = 0;
                      local_110._24_8_ = 0;
                      local_110.st_uid = 0;
                      local_110.st_gid = 0;
                      iVar9 = FUN_100217f70(&local_220,0,&local_110);
                      if ((iVar9 == 0) ||
                         (((local_110._0_8_ != *param_3 || local_110.st_ino != param_3[1]) ||
                          local_110._16_8_ != param_3[2]) || local_110._24_8_ != param_3[3]))
                      goto LAB_100217c2c;
                      uVar21 = 1;
                      local_1b0 = 1;
                      FUN_100219290(&local_220);
                    }
                  }
                  goto joined_r0x000100217c34;
                }
              }
            }
          }
          goto LAB_100217c2c;
        }
      }
    }
joined_r0x000100217c34:
    if (local_238 != (int *)0x0) {
      __ZdlPv();
    }
  }
  if (plStack_1c8 != (long *)0x0) {
    local_1c0 = plStack_1c8;
    __ZdlPv();
  }
  if (local_1e0 != (ulong *)0x0) {
    local_1d8 = local_1e0;
    __ZdlPv();
  }
  if ((char)bStack_1e1 < '\0') {
    __ZdlPv(local_1f8);
  }
  if (lStack_200 < 0) {
    __ZdlPv(local_210);
    if (*(long *)PTR____stack_chk_guard_1007c41d0 != local_78) goto LAB_100217cd8;
  }
  else if (*(long *)PTR____stack_chk_guard_1007c41d0 != local_78) {
LAB_100217cd8:
                    /* WARNING: Subroutine does not return */
    ___stack_chk_fail();
  }
  return uVar21;
}

