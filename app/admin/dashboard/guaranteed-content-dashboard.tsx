'use client'

import { useState } from 'react'

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview')
  
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Sidebar */}
      <div style={{ 
        width: '256px', 
        borderRight: '1px solid #e2e8f0', 
        backgroundColor: 'white',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Logo */}
        <div style={{ 
          padding: '20px', 
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ 
            width: '40px', 
            height: '40px', 
            borderRadius: '12px', 
            backgroundColor: '#8b5cf6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ color: 'white', fontSize: '24px' }}>🎓</span>
          </div>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '18px', color: '#8b5cf6' }}>CLAP</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Admin Portal</div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <button
              onClick={() => setActiveTab('overview')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                backgroundColor: activeTab === 'overview' ? '#ede9fe' : 'transparent',
                color: activeTab === 'overview' ? '#8b5cf6' : '#64748b',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <span>📊</span>
              Overview
            </button>
            
            <button
              onClick={() => setActiveTab('students')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                backgroundColor: activeTab === 'students' ? '#ede9fe' : 'transparent',
                color: activeTab === 'students' ? '#8b5cf6' : '#64748b',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <span>👥</span>
              Students
            </button>
            
            <button
              onClick={() => setActiveTab('batches')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                backgroundColor: activeTab === 'batches' ? '#ede9fe' : 'transparent',
                color: activeTab === 'batches' ? '#8b5cf6' : '#64748b',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <span>👥</span>
              Batches
            </button>
            
            <button
              onClick={() => setActiveTab('tests')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                backgroundColor: activeTab === 'tests' ? '#ede9fe' : 'transparent',
                color: activeTab === 'tests' ? '#8b5cf6' : '#64748b',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <span>📄</span>
              Tests
            </button>
            
            <button
              onClick={() => setActiveTab('analytics')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                backgroundColor: activeTab === 'analytics' ? '#ede9fe' : 'transparent',
                color: activeTab === 'analytics' ? '#8b5cf6' : '#64748b',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <span>📈</span>
              Analytics
            </button>
          </div>
        </nav>

        {/* Footer */}
        <div style={{ padding: '16px', borderTop: '1px solid #e2e8f0' }}>
          <button style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: '#64748b',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer'
          }}>
            <span>🚪</span>
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, padding: '24px' }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div>
            <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>
              Welcome, Admin
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Production Dashboard Active
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button style={{
              padding: '8px 16px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              backgroundColor: 'white',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: '14px'
            }}>
              🔄 Refresh
            </button>
            <button style={{
              padding: '8px 16px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              backgroundColor: 'white',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: '14px'
            }}>
              📥 Export
            </button>
            <button style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#8b5cf6',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px'
            }}>
              ➕ Add Student
            </button>
          </div>
        </div>

        {/* Tab Content - GUARANTEED TO SHOW CONTENT */}
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '24px' }}>
          {activeTab === 'overview' && (
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px', color: '#1e293b' }}>
                Dashboard Overview
              </h1>
              
              {/* Stats Grid */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
                gap: '16px',
                marginBottom: '24px'
              }}>
                <div style={{ 
                  padding: '24px', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '8px',
                  backgroundColor: '#f8fafc'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '14px', color: '#64748b' }}>Total Students</div>
                      <div style={{ fontSize: '32px', fontWeight: 'bold', marginTop: '4px', color: '#0f172a' }}>25</div>
                    </div>
                    <div style={{ 
                      width: '48px', 
                      height: '48px', 
                      borderRadius: '12px', 
                      backgroundColor: '#ede9fe',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <span style={{ color: '#8b5cf6', fontSize: '24px' }}>👥</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '12px', color: '#10b981', fontSize: '14px' }}>
                    <span>↗</span>
                    <span>+12% from last month</span>
                  </div>
                </div>

                <div style={{ 
                  padding: '24px', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '8px',
                  backgroundColor: '#f8fafc'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '14px', color: '#64748b' }}>Completed Tests</div>
                      <div style={{ fontSize: '32px', fontWeight: 'bold', marginTop: '4px', color: '#0f172a' }}>18</div>
                    </div>
                    <div style={{ 
                      width: '48px', 
                      height: '48px', 
                      borderRadius: '12px', 
                      backgroundColor: '#dcfce7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <span style={{ color: '#10b981', fontSize: '24px' }}>✅</span>
                    </div>
                  </div>
                  <div style={{ 
                    height: '8px', 
                    backgroundColor: '#e2e8f0', 
                    borderRadius: '4px',
                    marginTop: '12px',
                    overflow: 'hidden'
                  }}>
                    <div style={{ 
                      height: '100%', 
                      width: '72%', 
                      backgroundColor: '#10b981',
                      borderRadius: '4px'
                    }}></div>
                  </div>
                </div>

                <div style={{ 
                  padding: '24px', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '8px',
                  backgroundColor: '#f8fafc'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '14px', color: '#64748b' }}>In Progress</div>
                      <div style={{ fontSize: '32px', fontWeight: 'bold', marginTop: '4px', color: '#0f172a' }}>7</div>
                    </div>
                    <div style={{ 
                      width: '48px', 
                      height: '48px', 
                      borderRadius: '12px', 
                      backgroundColor: '#fef3c7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <span style={{ color: '#f59e0b', fontSize: '24px' }}>⏱️</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '14px', color: '#64748b', marginTop: '12px' }}>
                    Currently taking tests
                  </div>
                </div>

                <div style={{ 
                  padding: '24px', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '8px',
                  backgroundColor: '#f8fafc'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '14px', color: '#64748b' }}>Avg. Score</div>
                      <div style={{ fontSize: '32px', fontWeight: 'bold', marginTop: '4px', color: '#0f172a' }}>7.2/10</div>
                    </div>
                    <div style={{ 
                      width: '48px', 
                      height: '48px', 
                      borderRadius: '12px', 
                      backgroundColor: '#ede9fe',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <span style={{ color: '#8b5cf6', fontSize: '24px' }}>📈</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '14px', color: '#64748b', marginTop: '12px' }}>
                    72% average performance
                  </div>
                </div>
              </div>

              {/* Test Performance Section */}
              <div style={{ 
                padding: '24px', 
                border: '1px solid #e2e8f0', 
                borderRadius: '8px',
                backgroundColor: '#f8fafc'
              }}>
                <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#1e293b' }}>
                  Test Performance Overview
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {[
                    { name: 'Listening Test', score: 7.5, icon: '🎧' },
                    { name: 'Speaking Test', score: 6.8, icon: '🎤' },
                    { name: 'Reading Test', score: 8.1, icon: '📖' },
                    { name: 'Writing Test', score: 7.9, icon: '✍️' },
                    { name: 'Vocabulary Test', score: 8.3, icon: '🧠' }
                  ].map((test) => (
                    <div key={test.name} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ 
                        width: '40px', 
                        height: '40px', 
                        borderRadius: '8px', 
                        backgroundColor: '#ede9fe',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <span style={{ color: '#8b5cf6', fontSize: '20px' }}>{test.icon}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '14px', fontWeight: '500', color: '#1e293b' }}>{test.name}</span>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>{test.score}/10</span>
                        </div>
                        <div style={{ 
                          height: '8px', 
                          backgroundColor: '#e2e8f0', 
                          borderRadius: '4px',
                          overflow: 'hidden'
                        }}>
                          <div style={{ 
                            height: '100%', 
                            width: `${test.score * 10}%`, 
                            backgroundColor: '#8b5cf6',
                            borderRadius: '4px'
                          }}></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'students' && (
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px', color: '#1e293b' }}>
                Student Management
              </h1>
              
              <div style={{ 
                padding: '24px', 
                border: '1px solid #e2e8f0', 
                borderRadius: '8px',
                backgroundColor: '#f8fafc'
              }}>
                <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#1e293b' }}>
                  Student Directory
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {[
                    { name: 'John Smith', email: 'john.smith@example.com', status: 'completed', score: 42, avatar: 'JS' },
                    { name: 'Sarah Johnson', email: 'sarah.johnson@example.com', status: 'in_progress', score: null, avatar: 'SJ' },
                    { name: 'Mike Wilson', email: 'mike.wilson@example.com', status: 'completed', score: 38, avatar: 'MW' },
                    { name: 'Emma Davis', email: 'emma.davis@example.com', status: 'not_started', score: null, avatar: 'ED' }
                  ].map((student) => (
                    <div key={student.email} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '16px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      backgroundColor: 'white'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ 
                          width: '40px', 
                          height: '40px', 
                          borderRadius: '50%', 
                          backgroundColor: '#ede9fe',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <span style={{ color: '#8b5cf6', fontWeight: '600' }}>{student.avatar}</span>
                        </div>
                        <div>
                          <div style={{ fontWeight: '500', color: '#1e293b' }}>{student.name}</div>
                          <div style={{ fontSize: '14px', color: '#64748b' }}>{student.email}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <span style={{ 
                          padding: '4px 12px',
                          borderRadius: '16px',
                          fontSize: '12px',
                          fontWeight: '500',
                          backgroundColor: student.status === 'completed' ? '#dcfce7' : 
                                         student.status === 'in_progress' ? '#fef3c7' : '#f1f5f9',
                          color: student.status === 'completed' ? '#10b981' : 
                                student.status === 'in_progress' ? '#f59e0b' : '#64748b'
                        }}>
                          {student.status.replace('_', ' ')}
                        </span>
                        {student.score && (
                          <span style={{ fontWeight: '600', color: '#1e293b' }}>{student.score}/50</span>
                        )}
                        <button style={{
                          padding: '8px',
                          border: 'none',
                          backgroundColor: 'transparent',
                          cursor: 'pointer',
                          fontSize: '16px'
                        }}>
                          ✏️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'batches' && (
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px', color: '#1e293b' }}>
                Batch Management
              </h1>
              
              <div style={{ 
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '16px'
              }}>
                {[
                  { name: '2023-27', startYear: 2023, endYear: 2027, studentCount: 12, isActive: true, color: '#8b5cf6' },
                  { name: '2024-28', startYear: 2024, endYear: 2028, studentCount: 8, isActive: true, color: '#10b981' },
                  { name: '2025-29', startYear: 2025, endYear: 2029, studentCount: 5, isActive: false, color: '#64748b' }
                ].map((batch) => (
                  <div key={batch.name} style={{ 
                    border: '1px solid #e2e8f0', 
                    borderRadius: '8px',
                    backgroundColor: 'white',
                    padding: '20px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>{batch.name}</h3>
                      <span style={{ 
                        padding: '4px 12px',
                        borderRadius: '16px',
                        fontSize: '12px',
                        fontWeight: '500',
                        backgroundColor: batch.isActive ? '#dcfce7' : '#fee2e2',
                        color: batch.isActive ? '#10b981' : '#ef4444'
                      }}>
                        {batch.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>
                      <span>📅</span>
                      <span>{batch.startYear} - {batch.endYear}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                      <span>👥</span>
                      <span style={{ fontWeight: '500', color: '#1e293b' }}>{batch.studentCount}</span>
                      <span style={{ fontSize: '14px', color: '#64748b' }}>students enrolled</span>
                    </div>
                    <div style={{ 
                      paddingTop: '16px', 
                      borderTop: '1px solid #e2e8f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        Created 2 weeks ago
                      </span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button style={{
                          padding: '4px 8px',
                          border: 'none',
                          backgroundColor: 'transparent',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}>
                          ✏️
                        </button>
                        <button style={{
                          padding: '4px 8px',
                          border: 'none',
                          backgroundColor: 'transparent',
                          cursor: 'pointer',
                          fontSize: '14px',
                          color: '#ef4444'
                        }}>
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'tests' && (
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px', color: '#1e293b' }}>
                Test Management
              </h1>
              
              <div style={{ 
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '16px'
              }}>
                {[
                  { name: 'Listening Test', avgScore: 7.5, completionRate: 85, icon: '🎧' },
                  { name: 'Speaking Test', avgScore: 6.8, completionRate: 72, icon: '🎤' },
                  { name: 'Reading Test', avgScore: 8.1, completionRate: 92, icon: '📖' },
                  { name: 'Writing Test', avgScore: 7.9, completionRate: 88, icon: '✍️' },
                  { name: 'Vocabulary Test', avgScore: 8.3, completionRate: 95, icon: '🧠' }
                ].map((test) => (
                  <div key={test.name} style={{ 
                    border: '1px solid #e2e8f0', 
                    borderRadius: '8px',
                    backgroundColor: 'white',
                    padding: '20px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <div style={{ 
                        width: '48px', 
                        height: '48px', 
                        borderRadius: '12px', 
                        backgroundColor: '#ede9fe',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <span style={{ color: '#8b5cf6', fontSize: '24px' }}>{test.icon}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button style={{
                          padding: '8px',
                          border: 'none',
                          backgroundColor: 'transparent',
                          cursor: 'pointer',
                          fontSize: '16px'
                        }}>
                          ⚙️
                        </button>
                        <button style={{
                          padding: '8px',
                          border: 'none',
                          backgroundColor: 'transparent',
                          cursor: 'pointer',
                          fontSize: '16px'
                        }}>
                          👁️
                        </button>
                      </div>
                    </div>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '16px', marginBottom: '8px', color: '#1e293b' }}>
                      {test.name}
                    </h3>
                    <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
                      10 marks • Auto-evaluated
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                        <span style={{ color: '#64748b' }}>Avg. Score</span>
                        <span style={{ fontWeight: '600', color: '#1e293b' }}>{test.avgScore}/10</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                        <span style={{ color: '#64748b' }}>Completion Rate</span>
                        <span style={{ fontWeight: '600', color: '#1e293b' }}>{test.completionRate}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px', color: '#1e293b' }}>
                Analytics Dashboard
              </h1>
              
              <div style={{ 
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '24px'
              }}>
                <div style={{ 
                  padding: '24px', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '8px',
                  backgroundColor: '#f8fafc'
                }}>
                  <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#1e293b' }}>
                    Score Distribution
                  </h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {[
                      { range: '40-50', percentage: 25, count: 6 },
                      { range: '30-40', percentage: 45, count: 11 },
                      { range: '20-30', percentage: 20, count: 5 },
                      { range: '0-20', percentage: 10, count: 3 }
                    ].map((item) => (
                      <div key={item.range} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '14px', width: '48px', color: '#1e293b' }}>{item.range}</span>
                        <div style={{ 
                          flex: 1,
                          height: '12px', 
                          backgroundColor: '#e2e8f0', 
                          borderRadius: '6px',
                          overflow: 'hidden'
                        }}>
                          <div style={{ 
                            height: '100%', 
                            width: `${item.percentage}%`, 
                            backgroundColor: '#8b5cf6',
                            borderRadius: '6px'
                          }}></div>
                        </div>
                        <span style={{ fontSize: '14px', color: '#64748b' }}>{item.percentage}% ({item.count})</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ 
                  padding: '24px', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '8px',
                  backgroundColor: '#f8fafc'
                }}>
                  <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#1e293b' }}>
                    Performance Insights
                  </h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '14px', color: '#64748b' }}>Highest Score</span>
                      <span style={{ fontWeight: '600', color: '#1e293b' }}>45/50 (Emma Davis)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '14px', color: '#64748b' }}>Lowest Score</span>
                      <span style={{ fontWeight: '600', color: '#1e293b' }}>35/50 (Frank Miller)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '14px', color: '#64748b' }}>Best Performing Test</span>
                      <span style={{ fontWeight: '600', color: '#1e293b' }}>Reading (8.2/10)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '14px', color: '#64748b' }}>Needs Improvement</span>
                      <span style={{ fontWeight: '600', color: '#1e293b' }}>Speaking (6.5/10)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}